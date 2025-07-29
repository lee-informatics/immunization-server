import axios, { AxiosResponse } from 'axios';
import { mongoDb, connectMongo } from './mongo';
import * as fs from 'fs';
import * as path from 'path';
import { ExportJobState, ExportJobStateType } from '../types';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL, IMMUNIZATION_SERVER_URL } from '../config';

const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';
const BULK_IMPORT_COLLECTION_NAME = 'bulk_imports';

// Function to recursively process reference fields in JSON objects
function processReferenceFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Check if this string is a reference in the format "ResourceType/Number"
    const referenceMatch = obj.match(/^([A-Z][a-zA-Z]*)\/(\d+)$/);
    if (referenceMatch) {
      const [, resourceType, number] = referenceMatch;
      return `${resourceType}/ABC-${number}`;
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processReferenceFields(item));
  }
  
  if (typeof obj === 'object') {
    const processed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      processed[key] = processReferenceFields(value);
    }
    return processed;
  }
  
  return obj;
}

export function extractJobId(pollUrl: string): string {
  const match = pollUrl.match(/_jobId=([\w-]+)/);
  return match ? match[1] : pollUrl;
}

export let exportStatus: Record<string, ExportJobStateType> = {};
export let importStatus: Record<string, 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'> = {};

export async function pollAndStoreBulkExport(pollUrl: string): Promise<void> {
  const jobId = extractJobId(pollUrl);
  exportStatus[jobId] = ExportJobState.IN_PROGRESS;
  try {
    await connectMongo();
    await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
      { jobId },
      { $set: { jobId, status: ExportJobState.IN_PROGRESS, data: {} } },
      { upsert: true }
    );
  } catch (err: any) {
    console.error(`[EXPORT ERROR] jobId: ${jobId} failed to update MongoDB:`, err.message);
    return;
  }
  let done = false;
  let result: any = null;
  while (!done) {
    try {
      const response: AxiosResponse = await axios.get(pollUrl, { validateStatus: () => true });
      const errorMsg = response.data && response.data.issue && response.data.issue[0]?.diagnostics;
      console.log(`[EXPORT POLL] jobId: ${jobId} status: ${response.status} pollUrl: ${pollUrl}`);
      if (response.status === 202) {
        await new Promise(r => setTimeout(r, 10000));
      } else if (response.status === 200) {
        result = response.data;
        done = true;
        let binaries: Record<string, any[]> = {};
        if (result && Array.isArray(result.output)) {
          try {
            binaries = await fetchAndStoreBinaries(result.output);
          } catch (err: any) {
            console.error(`[BINARY FETCH ERROR] jobId: ${jobId} err:`, err.message);
          }
        }
        exportStatus[jobId] = ExportJobState.FINISHED;
        try {
          await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
            { jobId },
            { $set: { status: ExportJobState.FINISHED, data: result, binaries, finishedAt: new Date() } }
          );
          console.log(`[EXPORT DONE] jobId: ${jobId} (binaries stored)`);
          
          // Automatically trigger import after export completes
          console.log(`[AUTO IMPORT] Triggering import after export completion for jobId: ${jobId}`);
          await triggerAutoImport(jobId);
        } catch (err: any) {
          console.error(`[EXPORT ERROR] jobId: ${jobId} failed to update MongoDB:`, err.message);
        }
      } else {
        done = true;
        exportStatus[jobId] = ExportJobState.FAILED;
        try {
          await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
            { jobId: jobId },
            { $set: { status: ExportJobState.FAILED, data: {}, finishedAt: new Date() } }
          );
        } catch (err: any) {
          console.error(`[EXPORT ERROR] jobId: ${jobId} failed to update MongoDB:`, err.message);
        }
        console.log(`[EXPORT ERROR] jobId: ${jobId} status: ${response.status} pollUrl: ${pollUrl} errorMsg: ${errorMsg}`);
      }
    } catch (err: any) {
      done = true;
      exportStatus[jobId] = ExportJobState.FAILED;
      try {
        await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
          { jobId },
          { $set: { status: ExportJobState.FAILED, data: {}, finishedAt: new Date() } }
        );
      } catch (mongoErr: any) {
        console.error(`[EXPORT ERROR] jobId: ${jobId} failed to update MongoDB:`, mongoErr.message);
      }
      console.error(`[EXPORT ERROR] jobId: ${jobId} pollUrl: ${pollUrl} err:`, err.message);
    }
  }
}

export async function fetchAndStoreBinaries(output: any[]): Promise<Record<string, any[]>> {
  const binaries: Record<string, any[]> = {};
  for (const entry of output) {
    if (entry.type && entry.url) {
      if (!binaries[entry.type]) binaries[entry.type] = [];
      try {
        const response: AxiosResponse = await axios.get(entry.url, { headers: { 'Accept': 'application/fhir+json' } });
        if (response.data) {
          binaries[entry.type].push(response.data);
        }
      } catch (err: any) {
        console.error(`[BINARY ERROR] url: ${entry.url} err:`, err.message);
      }
    }
  }
  return binaries;
}

export function decodeAndFilterRecords(binaries: Record<string, any[]>, patientId: string): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const type in binaries) {
    result[type] = [];
    for (const binary of binaries[type]) {
      if (!binary.data) continue;
      let decoded: string;
      try {
        decoded = Buffer.from(binary.data, 'base64').toString('utf-8');
      } catch (e) {
        continue;
      }
      const lines = decoded.trim().split(/\r?\n/);
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const ref = record.patient?.reference || record.subject?.reference;
          if (ref === `Patient/${patientId}`) {
            result[type].push(record);
          }
        } catch (e) {}
      }
    }
    if (result[type].length === 0) delete result[type];
  }
  return result;
}

export async function processLatestBulkExportToNDJSON(): Promise<{ success: boolean; files: string[]; error?: string }> {
  try {
    await connectMongo();
    
    const latest = await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME)
      .find({ status: ExportJobState.FINISHED })
      .sort({ finishedAt: -1 })
      .limit(1)
      .toArray();
    
    if (latest.length === 0) {
      return { success: false, files: [], error: 'No finished export found' };
    }
    
    const exportDoc = latest[0];
    const binaries = exportDoc.binaries;
    
    if (!binaries) {
      return { success: false, files: [], error: 'No binaries found in latest export' };
    }
    
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    const createdFiles: string[] = [];
    
    for (const [resourceType, binaryArray] of Object.entries(binaries)) {
      if (!Array.isArray(binaryArray) || binaryArray.length === 0) continue;
      
      const allRecords: any[] = [];
      
      for (const binary of binaryArray) {
        if (!binary.data) continue;
        
        try {
          // Decode base64 data
          const decoded = Buffer.from(binary.data, 'base64').toString('utf-8');
          const lines = decoded.trim().split(/\r?\n/);
          
          // Parse each line as JSON
          for (const line of lines) {
            if (line.trim()) {
              try {
                const record = JSON.parse(line);
                
                // Process the entire record to handle both id fields and reference fields
                const processedRecord = processReferenceFields(record);
                
                allRecords.push(processedRecord);
              } catch (parseError) {
                console.error(`[NDJSON ERROR] Failed to parse line in ${resourceType}:`, parseError);
              }
            }
          }
        } catch (decodeError) {
          console.error(`[NDJSON ERROR] Failed to decode binary for ${resourceType}:`, decodeError);
        }
      }
      
      // Write to NDJSON file
      if (allRecords.length > 0) {
        const filename = `${resourceType}.ndjson`;
        const filepath = path.join(exportsDir, filename);
        
        const ndjsonContent = allRecords
          .map(record => JSON.stringify(record))
          .join('\n');
        
        fs.writeFileSync(filepath, ndjsonContent, 'utf-8');
        createdFiles.push(filename);
        
        console.log(`[NDJSON] Created ${filename} with ${allRecords.length} records`);
      }
    }
    
    return { success: true, files: createdFiles };
    
  } catch (error: any) {
    console.error('[NDJSON ERROR] Failed to process latest bulk export:', error.message);
    return { success: false, files: [], error: error.message };
  }
}

export function getNDJSONFileList(): string[] {
  try {
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      return [];
    }
    
    return fs.readdirSync(exportsDir)
      .filter(file => file.endsWith('.ndjson'))
      .sort();
  } catch (error: any) {
    console.error('[NDJSON ERROR] Failed to get file list:', error.message);
    return [];
  }
}

export function getNDJSONFileContent(filename: string): { success: boolean; content?: string; error?: string } {
  try {
    const exportsDir = path.join(process.cwd(), 'exports');
    const filepath = path.join(exportsDir, filename);
    
    if (!fs.existsSync(filepath)) {
      return { success: false, error: `File ${filename} not found` };
    }
    
    const content = fs.readFileSync(filepath, 'utf-8');
    return { success: true, content };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Auto-import functionality
export async function triggerAutoImport(exportJobId: string): Promise<void> {
  try {
    console.log(`[AUTO IMPORT] Starting auto-import for export job: ${exportJobId}`);
    
    // Process the export to NDJSON first
    const processResult = await processLatestBulkExportToNDJSON();
    if (!processResult.success) {
      console.error(`[AUTO IMPORT] Failed to process export to NDJSON: ${processResult.error}`);
      return;
    }
    
    // Generate import job ID
    const importJobId = `import_${exportJobId}_${Date.now()}`;
    importStatus[importJobId] = 'IN_PROGRESS';
    
    // Store import job in MongoDB
    await connectMongo();
    await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
      { importJobId },
      { $set: { importJobId, exportJobId, status: 'IN_PROGRESS', startedAt: new Date() } },
      { upsert: true }
    );
    
    // Trigger the import
    const targetUrl = IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL;
    const inputFormat = 'application/fhir+ndjson';
    const maxBatchSize = '500';
    
    const availableFiles = getNDJSONFileList();
    if (availableFiles.length === 0) {
      console.error('[AUTO IMPORT] No NDJSON files available for import');
      importStatus[importJobId] = 'FAILED';
      await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
        { importJobId },
        { $set: { status: 'FAILED', error: 'No NDJSON files available', finishedAt: new Date() } }
      );
      return;
    }
    
    const importPayload: any = {
      resourceType: "Parameters",
      parameter: [
        {
          name: "inputFormat",
          valueCode: inputFormat
        },
        {
          name: "storageDetail",
          part: [
            {
              name: "type",
              valueCode: "file"
            },
            {
              name: "maxBatchResourceCount",
              valueString: maxBatchSize
            }
          ]
        }
      ]
    };
    
    for (const filename of availableFiles) {
      const resourceType = filename.replace('.ndjson', '');
      const fileUrl = `${IMMUNIZATION_SERVER_URL}/api/bulk-export/ndjson/files/${filename}`;
      
      importPayload.parameter.push({
        name: "input",
        part: [
          { name: "type", valueCode: resourceType },
          { name: "url", valueUri: fileUrl }
        ]
      } as any);
    }
    
    console.log(`[AUTO IMPORT] Triggering import to ${targetUrl} with ${availableFiles.length} files`);
    const response: AxiosResponse = await axios.post(`${targetUrl}/$import`, importPayload, {
      headers: {
        "Content-Type": "application/fhir+json",
        "Prefer": "respond-async"
      },
      validateStatus: () => true
    });
    
    if (response.status === 202) {
      const statusUrl = response.headers["content-location"];
      console.log(`[AUTO IMPORT] Import triggered successfully. Status URL: ${statusUrl}`);
      
      // Start polling the import status
      pollImportStatus(statusUrl, importJobId);
    } else {
      console.error(`[AUTO IMPORT] Failed to trigger import. Status: ${response.status}`);
      importStatus[importJobId] = 'FAILED';
      await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
        { importJobId },
        { $set: { status: 'FAILED', error: `Failed to trigger import. Status: ${response.status}`, finishedAt: new Date() } }
      );
    }
  } catch (err: any) {
    console.error(`[AUTO IMPORT ERROR] Failed to trigger auto-import:`, err.message);
  }
}

export async function pollImportStatus(statusUrl: string, importJobId: string): Promise<void> {
  console.log(`[IMPORT POLL] Starting to poll import status for job: ${importJobId}`);
  
  let completed = false;
  let result: any = null;
  let attempts = 0;
  const maxAttempts = 100;
  const pollInterval = 5000; // 5 seconds
  
  while (!completed && attempts < maxAttempts) {
    attempts++;
    
    try {
      const response: AxiosResponse = await axios.get(statusUrl, {
        headers: { "Accept": "application/json" },
        validateStatus: () => true
      });
      
      if (response.status === 202) {
        console.log(`[IMPORT POLL] Attempt ${attempts}: Import still in progress for job: ${importJobId}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } else if (response.status === 200) {
        console.log(`[IMPORT POLL] Import completed successfully for job: ${importJobId} after ${attempts} attempts`);
        result = response.data;
        completed = true;
        importStatus[importJobId] = 'COMPLETED';
        
        // Update MongoDB
        await connectMongo();
        await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
          { importJobId },
          { $set: { status: 'COMPLETED', result, finishedAt: new Date() } }
        );
      } else {
        console.error(`[IMPORT POLL] Import failed with status ${response.status} for job: ${importJobId}`);
        importStatus[importJobId] = 'FAILED';
        
        // Update MongoDB
        await connectMongo();
        await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
          { importJobId },
          { $set: { status: 'FAILED', error: `Import failed with status ${response.status}`, finishedAt: new Date() } }
        );
        return;
      }
    } catch (err: any) {
      console.error(`[IMPORT POLL ERROR] Failed to poll import status for job: ${importJobId}:`, err.message);
      importStatus[importJobId] = 'FAILED';
      
      // Update MongoDB
      await connectMongo();
      await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
        { importJobId },
        { $set: { status: 'FAILED', error: err.message, finishedAt: new Date() } }
      );
      return;
    }
  }
  
  if (!completed) {
    console.error(`[IMPORT POLL] Import polling timed out for job: ${importJobId}`);
    importStatus[importJobId] = 'FAILED';
    
    // Update MongoDB
    await connectMongo();
    await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).updateOne(
      { importJobId },
      { $set: { status: 'FAILED', error: 'Import polling timed out after maximum attempts', finishedAt: new Date() } }
    );
  }
}

export async function getImportStatus(importJobId: string): Promise<any> {
  try {
    await connectMongo();
    const importJob = await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME).findOne({ importJobId });
    return importJob;
  } catch (err: any) {
    console.error(`[IMPORT STATUS ERROR] Failed to get import status for job: ${importJobId}:`, err.message);
    return null;
  }
}

export async function getLatestImportStatus(): Promise<any> {
  try {
    await connectMongo();
    const latest = await mongoDb!.collection(BULK_IMPORT_COLLECTION_NAME)
      .find().sort({ startedAt: -1 }).limit(1).toArray();
    return latest.length > 0 ? latest[0] : null;
  } catch (err: any) {
    console.error('[IMPORT STATUS ERROR] Failed to get latest import status:', err.message);
    return null;
  }
} 