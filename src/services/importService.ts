import axios, { AxiosResponse } from 'axios';
import { mongoDb, connectMongo } from './mongo';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL, IMMUNIZATION_SERVER_URL } from '../config';
import { processLatestBulkExportToNDJSON, getNDJSONFileList } from './ndjsonService';

const BULK_IMPORT_COLLECTION_NAME = 'bulk_imports';

export let importStatus: Record<string, 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'> = {};

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