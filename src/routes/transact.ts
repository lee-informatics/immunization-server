import { Router, Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { connectMongo, mongoDb } from '../services/mongo';
import { ExportJobState, ExportJobStateType } from '../types';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';
import { triggerTransaction } from '../services/transactionService';

const router = Router();
const TRANSACTION_COLLECTION_NAME = 'transactions';

// Define sort order based on inter-resource dependencies
const PRIORITY: Record<string, number> = {
  "Organization": 1,
  "Location": 2,
  "Practitioner": 3,
  "PractitionerRole": 4,
  "Patient": 5,
  "Device": 6,
  "Medication": 7,
  "Encounter": 8,
  "Condition": 9,
  "Procedure": 10,
  "CareTeam": 11,
  "CarePlan": 12,
  "Immunization": 13,
  "MedicationRequest": 14,
  "MedicationAdministration": 15,
  "Observation": 16,
  "DiagnosticReport": 17,
  "ImagingStudy": 18,
  "DocumentReference": 19,
  "AllergyIntolerance": 20,
  "Claim": 21,
  "ExplanationOfBenefit": 22,
  "SupplyDelivery": 23,
  "Provenance": 24
};

function convertReferencesToUrn(obj: any): void {
  /**
   * Recursively convert all FHIR references in any resource to urn:uuid:<id> format,
   * skipping existing urn:uuid or absolute URLs.
   */
  if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        convertReferencesToUrn(item);
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (key === "reference" && typeof value === "string") {
          if (!value.startsWith("urn:uuid:") && !value.startsWith("http:") && !value.startsWith("https:") && value.includes("/")) {
            const parts = value.split("/");
            if (parts.length === 2) {
              const oldValue = value;
              obj[key] = `urn:uuid:${parts[1]}`;
              console.log(`[CONVERT_REF] Converted reference: ${oldValue} -> ${obj[key]}`);
            }
          }
        } else {
          convertReferencesToUrn(value);
        }
      }
    }
  }
}

function createTransactionBundle(): any {
  const entries: any[] = [];
  const exportsDir = path.join(process.cwd(), 'exports');

  try {
    console.log(`[CREATE_BUNDLE] Reading exports directory: ${exportsDir}`);
    const files = fs.readdirSync(exportsDir);
    console.log(`[CREATE_BUNDLE] Found files:`, files);
    
    for (const file of files) {
      if (!file.endsWith('.ndjson')) {
        console.log(`[CREATE_BUNDLE] Skipping non-NDJSON file: ${file}`);
        continue;
      }

      console.log(`[CREATE_BUNDLE] Processing file: ${file}`);
      const filePath = path.join(exportsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      console.log(`[CREATE_BUNDLE] File ${file} has ${lines.length} lines`);

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        try {
          const resource = JSON.parse(lines[lineNum]);
          const resourceType = resource.resourceType;
          const resourceId = resource.id;

          if (!resourceType || !resourceId) {
            console.log(`[CREATE_BUNDLE] Skipping invalid resource at line ${lineNum + 1} in ${file}`);
            continue;
          }

          const fullUrl = `urn:uuid:${resourceId}`;
          convertReferencesToUrn(resource);

          entries.push({
            fullUrl,
            resource,
            request: {
              method: "POST",
              url: resourceType
            }
          });
          
          if (lineNum < 3) {
            console.log(`[CREATE_BUNDLE] Added resource: ${resourceType}/${resourceId}`);
          }
        } catch (parseError) {
          console.error(`[CREATE_BUNDLE] Invalid JSON in ${file} on line ${lineNum + 1}:`, parseError);
        }
      }
    }

    console.log(`[CREATE_BUNDLE] Total entries created: ${entries.length}`);
    
    // Sort entries by dependency order
    console.log(`[CREATE_BUNDLE] Sorting entries by dependency order...`);
    entries.sort((a, b) => {
      const aPriority = PRIORITY[a.resource.resourceType as string] || 99;
      const bPriority = PRIORITY[b.resource.resourceType as string] || 99;
      return aPriority - bPriority;
    });

    const bundle = {
      resourceType: "Bundle",
      type: "transaction",
      entry: entries
    };
    
    console.log(`[CREATE_BUNDLE] Bundle created successfully with ${entries.length} entries`);
    return bundle;
  } catch (error) {
    console.error(`[CREATE_BUNDLE] Error creating bundle:`, error);
    throw new Error(`Failed to create transaction bundle: ${error}`);
  }
}

async function transactBundle(bundle: any, fhirUrl: string): Promise<any> {
  const headers = {
    "Content-Type": "application/fhir+json",
    "Accept": "application/fhir+json"
  };

  console.log(`[TRANSACT_BUNDLE] Sending bundle to ${fhirUrl} ...`);
  console.log(`[TRANSACT_BUNDLE] Bundle size: ${bundle.entry.length} entries`);
  console.log(`[TRANSACT_BUNDLE] Bundle type: ${bundle.type}`);
  
  // Validate bundle before sending
  if (!bundle.entry || bundle.entry.length === 0) {
    throw new Error("Bundle has no entries");
  }
  
  if (bundle.entry.length > 1000) {
    console.warn(`[TRANSACT_BUNDLE] Large bundle detected: ${bundle.entry.length} entries. This might cause issues.`);
  }
  
  // Check for any obvious issues in the first few entries
  const sampleEntries = bundle.entry.slice(0, 5);
  console.log(`[TRANSACT_BUNDLE] Sample entries:`, sampleEntries.map((e: any) => ({
    resourceType: e.resource.resourceType,
    id: e.resource.id,
    fullUrl: e.fullUrl,
    hasRequest: !!e.request,
    requestMethod: e.request?.method,
    requestUrl: e.request?.url
  })));

  try {
    const response = await axios.post(fhirUrl, bundle, { headers });

    console.log(`[TRANSACT_BUNDLE] FHIR server response status: ${response.status}`);
    console.log(`[TRANSACT_BUNDLE] FHIR server response headers:`, response.headers);
    console.log(`[TRANSACT_BUNDLE] FHIR server response data:`, response.data);

    if (response.status === 200 || response.status === 201) {
      console.log("[TRANSACT_BUNDLE] Bundle transaction successful.");
      return {
        success: true,
        status: response.status,
        data: response.data
      };
    } else {
      console.error(`[TRANSACT_BUNDLE] Transaction failed with status ${response.status}`);
      console.error(`[TRANSACT_BUNDLE] Error response:`, response.data);
      throw new Error(`Transaction failed: HTTP ${response.status} - ${JSON.stringify(response.data)}`);
    }
  } catch (error: any) {
    console.error(`[TRANSACT_BUNDLE] Axios error:`, error.message);
    if (error.response) {
      console.error(`[TRANSACT_BUNDLE] Error response status: ${error.response.status}`);
      console.error(`[TRANSACT_BUNDLE] Error response headers:`, error.response.headers);
      console.error(`[TRANSACT_BUNDLE] Error response data:`, error.response.data);
      throw new Error(`Transaction failed: HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      throw error;
    }
  }
}

export async function processTransactionAsync(jobId: string): Promise<void> {
  try {
    console.log(`[TRANSACTION] Starting processTransactionAsync for jobId: ${jobId}`);
    await connectMongo();
    
    // Check if MongoDB connection is available
    if (!mongoDb) {
      console.error(`[TRANSACTION] MongoDB connection not available for jobId: ${jobId}`);
      throw new Error('Database connection not available');
    }
    
    // Create transaction bundle
    console.log(`[TRANSACTION] Creating transaction bundle...`);
    const bundle = createTransactionBundle();
    console.log(`[TRANSACTION] Transaction bundle created with ${bundle.entry.length} resources.`);
    console.log(`[TRANSACTION] Bundle resource types:`, bundle.entry.map((e: any) => e.resource.resourceType));

    // Send bundle to FHIR server
    console.log(`[TRANSACTION] Sending bundle to FHIR server: ${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}`);
    const result = await transactBundle(bundle, IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL);
    console.log(`[TRANSACTION] FHIR server response:`, result);
    
    // Update database with success
    console.log(`[TRANSACTION] Updating database with success for jobId: ${jobId}`);
    await mongoDb.collection(TRANSACTION_COLLECTION_NAME).updateOne(
      { jobId },
      { 
        $set: { 
          status: ExportJobState.FINISHED,
          completedAt: new Date(),
          resourcesCount: bundle.entry.length,
          result: result
        }
      }
    );
    
    console.log(`[TRANSACTION] Transaction ${jobId} completed successfully`);
  } catch (error: any) {
    console.error(`[TRANSACTION] Transaction ${jobId} failed:`, error.message);
    console.error(`[TRANSACTION] Full error details:`, error);
    console.error(`[TRANSACTION] Error stack:`, error.stack);
    
    // Try to update database with failure, but don't fail if DB is not available
    try {
      if (mongoDb) {
        await mongoDb.collection(TRANSACTION_COLLECTION_NAME).updateOne(
          { jobId },
          { 
            $set: { 
              status: ExportJobState.FAILED,
              completedAt: new Date(),
              error: error.message
            }
          }
        );
      }
    } catch (dbError) {
      console.error(`[TRANSACTION] Failed to update database with error status for jobId: ${jobId}`, dbError);
    }
  }
}

router.post('/', async (req: Request, res: Response) => {
  console.log('[API] POST /api/transact');
  
  try {
    const jobId = uuidv4();
    
    // Create the initial transaction record first
    await connectMongo();
    if (!mongoDb) {
      console.error('[API ERROR] MongoDB connection not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    // Create initial transaction record
    await mongoDb.collection(TRANSACTION_COLLECTION_NAME).updateOne(
      { jobId },
      { 
        $set: { 
          jobId, 
          status: ExportJobState.IN_PROGRESS, 
          createdAt: new Date(), 
          type: 'transaction' 
        } 
      },
      { upsert: true }
    );
    
    // Start the transaction processing in the background
    triggerTransaction(jobId).catch(err => {
      console.error('[API ERROR] Background transaction failed:', err);
    });
    
    // Return immediately with 201
    res.status(201).json({
      message: 'Transaction started', 
      jobId: jobId, 
      status: ExportJobState.IN_PROGRESS,
      pollUrl: `/api/transact/status?jobId=${jobId}`
    });
  } catch (err: any) {
    console.error('[API ERROR] /api/transact:', err.message);
    
    const errorResponse = createErrorResponse(err, IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL, 'local');
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/status', async (req: Request, res: Response) => {
  console.log('[API] GET /api/transact/status', req.query);
  const { jobId } = req.query;
  
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'Missing jobId' });
  }
  
  try {
    await connectMongo();
    
    // Check if MongoDB connection is available
    if (!mongoDb) {
      console.error('[API ERROR] MongoDB connection not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const transaction = await mongoDb.collection(TRANSACTION_COLLECTION_NAME).findOne({ jobId });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const status = transaction.status as ExportJobStateType;
    
    if (status === ExportJobState.IN_PROGRESS) {
      return res.status(202).json({ 
        jobId, 
        status, 
        createdAt: transaction.createdAt,
        type: transaction.type
      });
    }
    
    res.status(200).json({ 
      jobId, 
      status, 
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      resourcesCount: transaction.resourcesCount,
      error: transaction.error,
      type: transaction.type
    });
  } catch (err: any) {
    console.error('[API ERROR] /api/transact/status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router; 