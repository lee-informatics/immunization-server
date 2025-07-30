import * as fs from 'fs';
import * as path from 'path';
import { connectMongo, getMongoDb } from './mongo';
import { ExportJobState } from '../types';
import { fetchAndStoreBinaries } from './binaryService';

const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';

// Function to recursively process reference fields in JSON objects
function processReferenceFields(obj: any, parentKey?: string): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Skip processing if we're inside a coding object
    if (parentKey === 'code' ||  parentKey == "versionId") {
      return obj;
    }
    
    // Check if this string is a reference in the format "ResourceType/Number"
    const referenceMatch = obj.match(/^([A-Z][a-zA-Z]*)\/(\d+)$/);
    if (referenceMatch) {
      const [, resourceType, number] = referenceMatch;
      return `${resourceType}/ABC-${number}`;
    }
    
    // Check if this string is a standalone ID (just numbers)
    const idMatch = obj.match(/^(\d+)$/);
    if (idMatch) {
      return `ABC-${obj}`;
    }
    
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processReferenceFields(item, parentKey));
  }
  
  if (typeof obj === 'object') {
    const processed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      processed[key] = processReferenceFields(value, key);
    }
    return processed;
  }
  
  return obj;
}

export async function processExportToNDJSON(exportJobId: string): Promise<{ success: boolean; files: string[]; error?: string }> {
  try {
    console.log(`[NDJSON] Starting processExportToNDJSON for exportJobId: ${exportJobId}`);
    await connectMongo();
    
    const db = getMongoDb();
    const latest = await db.collection(BULK_EXPORT_COLLECTION_NAME)
      .find({ jobId: exportJobId, status: ExportJobState.FINISHED })
      .sort({ finishedAt: -1 })
      .limit(1)
      .toArray();
    
    console.log(`[NDJSON] Found ${latest.length} finished exports for jobId: ${exportJobId}`);
    
    if (latest.length === 0) {
      console.log(`[NDJSON] No finished export found for jobId: ${exportJobId}`);
      return { success: false, files: [], error: 'No finished export found' };
    }
    
    const exportDoc = latest[0];
    console.log(`[NDJSON] Processing export document:`, { 
      jobId: exportDoc.jobId, 
      status: exportDoc.status, 
      hasData: !!exportDoc.data,
      hasDataOutput: !!(exportDoc.data && exportDoc.data.output),
      dataOutputLength: exportDoc.data?.output?.length || 0
    });
    
    let binaries: Record<string, any[]> = {};
    if (exportDoc && exportDoc.data && exportDoc.data.output && Array.isArray(exportDoc.data.output)) {
      console.log(`[NDJSON] Output entries found:`, exportDoc.data.output.length);
      console.log(`[NDJSON] First few output entries:`, exportDoc.data.output.slice(0, 3));
      
      try {
        binaries = await fetchAndStoreBinaries(exportDoc.data.output);
        console.log(`[NDJSON] Fetched binaries for resource types:`, Object.keys(binaries));
      } catch (err: any) {
        console.error('[BINARY FETCH ERROR]', err.message);
      }
    }
    
    if (!binaries || Object.keys(binaries).length === 0) {
      console.log(`[NDJSON] No binaries found in latest export`);
      return { success: false, files: [], error: 'No binaries found in latest export' };
    }
    
    const exportsDir = path.join(process.cwd(), 'exports');
    const exportJobDir = path.join(exportsDir, exportJobId);
    console.log(`[NDJSON] Exports directory: ${exportsDir}`);
    console.log(`[NDJSON] Export job directory: ${exportJobDir}`);
    
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
      console.log(`[NDJSON] Created exports directory: ${exportsDir}`);
    }
    if (!fs.existsSync(exportJobDir)) {
      fs.mkdirSync(exportJobDir, { recursive: true });
      console.log(`[NDJSON] Created export job directory: ${exportJobDir}`);
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
      
      // Write to NDJSON file in export job specific directory
      if (allRecords.length > 0) {
        const filename = `${resourceType}.ndjson`;
        const filepath = path.join(exportJobDir, filename);
        
        const ndjsonContent = allRecords
          .map(record => JSON.stringify(record))
          .join('\n');
        
        fs.writeFileSync(filepath, ndjsonContent, 'utf-8');
        createdFiles.push(filename);
        
        console.log(`[NDJSON] Created ${filename} with ${allRecords.length} records in ${exportJobId}`);
        console.log(`[NDJSON] File path: ${filepath}`);
        console.log(`[NDJSON] File exists after write: ${fs.existsSync(filepath)}`);
      }
    }
    
    console.log(`[NDJSON] Process completed. Created ${createdFiles.length} files:`, createdFiles);
    console.log(`[NDJSON] Final check - files in export job directory:`, fs.readdirSync(exportJobDir));
    
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