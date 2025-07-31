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
    console.log(`[NDJSON] Starting for exportJobId: ${exportJobId}`);
    await connectMongo();
    const db = getMongoDb();

    // Step 1: Fetch latest export
    const latest = await db.collection(BULK_EXPORT_COLLECTION_NAME)
      .find({ jobId: exportJobId, status: ExportJobState.FINISHED })
      .sort({ finishedAt: -1 })
      .limit(1)
      .toArray();

    if (!latest || latest.length === 0) {
      const msg = `No finished export found for jobId: ${exportJobId}`;
      console.error(`[NDJSON ERROR] ${msg}`);
      return { success: false, files: [], error: msg };
    }

    const exportDoc = latest[0];
    const output = exportDoc.data?.output;
    if (!output || !Array.isArray(output) || output.length === 0) {
      const msg = `Export document has no valid output for jobId: ${exportJobId}`;
      console.error(`[NDJSON ERROR] ${msg}`);
      return { success: false, files: [], error: msg };
    }

    // Step 2: Fetch binaries
    let binaries: Record<string, any[]>;
    try {
      binaries = await fetchAndStoreBinaries(output);
    } catch (err: any) {
      const msg = `Failed to fetch binaries: ${err.message}`;
      console.error(`[BINARY FETCH ERROR] ${msg}`);
      return { success: false, files: [], error: msg };
    }

    if (!binaries || Object.keys(binaries).length === 0) {
      const msg = `No binaries were fetched for jobId: ${exportJobId}`;
      console.error(`[NDJSON ERROR] ${msg}`);
      return { success: false, files: [], error: msg };
    }

    // Step 3: Create export directory
    const exportsDir = path.join(process.cwd(), 'exports');
    const exportJobDir = path.join(exportsDir, exportJobId);
    try {
      if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
      if (!fs.existsSync(exportJobDir)) fs.mkdirSync(exportJobDir, { recursive: true });
    } catch (err: any) {
      const msg = `Failed to create export directory: ${err.message}`;
      console.error(`[NDJSON ERROR] ${msg}`);
      return { success: false, files: [], error: msg };
    }

    const createdFiles: string[] = [];

    // Step 4: Decode binaries and write NDJSON files
    for (const [resourceType, binaryArray] of Object.entries(binaries)) {
      if (!Array.isArray(binaryArray) || binaryArray.length === 0) continue;

      const allRecords: any[] = [];

      for (const binary of binaryArray) {
        if (!binary.data) continue;

        let lines: string[] = [];
        try {
          const decoded = Buffer.from(binary.data, 'base64').toString('utf-8');
          lines = decoded.trim().split(/\r?\n/);
        } catch (err: any) {
          const msg = `Base64 decode error in ${resourceType}: ${err.message}`;
          console.error(`[NDJSON ERROR] ${msg}`);
          return { success: false, files: [], error: msg };
        }

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            const processed = processReferenceFields(record);
            allRecords.push(processed);
          } catch (err: any) {
            const msg = `Invalid JSON in ${resourceType} line: ${err.message}`;
            console.error(`[NDJSON ERROR] ${msg}`);
            return { success: false, files: [], error: msg };
          }
        }
      }

      if (allRecords.length > 0) {
        const filename = `${resourceType}.ndjson`;
        const filepath = path.join(exportJobDir, filename);

        try {
          fs.writeFileSync(filepath, allRecords.map(r => JSON.stringify(r)).join('\n'), 'utf-8');
          createdFiles.push(filename);
        } catch (err: any) {
          const msg = `Failed to write file ${filename}: ${err.message}`;
          console.error(`[NDJSON ERROR] ${msg}`);
          return { success: false, files: [], error: msg };
        }
      }
    }

    console.log(`[NDJSON] Completed with ${createdFiles.length} files`);
    return { success: true, files: createdFiles };

  } catch (err: any) {
    const msg = `Unexpected NDJSON processing error: ${err.message}`;
    console.error(`[NDJSON ERROR] ${msg}`);
    return { success: false, files: [], error: msg };
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