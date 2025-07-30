import * as fs from 'fs';
import * as path from 'path';
import { mongoDb, connectMongo } from './mongo';
import { ExportJobState } from '../types';

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