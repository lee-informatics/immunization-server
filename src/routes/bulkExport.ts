import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_IIS_FHIR_URL, IMMUNIZATION_SERVER_URL, IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { connectMongo, mongoDb } from '../services/mongo';
import { ExportJobState, ExportJobStateType } from '../types';
import {
  pollAndStoreBulkExport,
  extractJobId,
  exportStatus,
  processLatestBulkExportToNDJSON,
  getNDJSONFileList,
  getNDJSONFileContent,
  getImportStatus,
  getLatestImportStatus
} from '../services/bulkExportService';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';

const router = Router();
const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/patient-export', req.query);
  try {
    let typesToExport: string[] = (req.query.types as string | undefined)?.split(',') || ['Immunization', 'Condition'];
    const typeParam = typesToExport.length > 0 ? `?_type=${typesToExport.join(',')}` : '';
    const url = `${IMMUNIZATION_SERVER_IIS_FHIR_URL}/$export`;
    console.log(`[EXPORT START] ${url}`);
    const response: AxiosResponse = await axios.get(url, {
      headers: {
        'Accept': 'application/fhir+json',
        'Prefer': 'respond-async',
      },
      validateStatus: () => true,
      timeout: 30000 // 30 second timeout
    });
    const pollUrl = response.headers['content-location'];
    if (!pollUrl) {
      const errorMsg = response.data && response.data.issue && response.data.issue[0]?.diagnostics;
      console.error('[EXPORT ERROR] No Content-Location returned.', errorMsg);
      return res.status(500).json({ error: 'No Content-Location returned.', fhirError: errorMsg, status: response.status, url });
    }
    const jobId = extractJobId(pollUrl);
    pollAndStoreBulkExport(pollUrl);
    exportStatus[jobId] = ExportJobState.IN_PROGRESS;
    res.json({ pollUrl, jobId, status: ExportJobState.IN_PROGRESS });
  } catch (err: any) {
    console.error('[API ERROR] /api/patient-export:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_IIS_FHIR_URL}/$export`, 'immunization', { url: err.config?.url });
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/status', async (req: Request, res: Response) => {
  console.log('[API] GET /api/patient-export/status', req.query);
  const { jobId } = req.query;
  if (!jobId || typeof jobId !== 'string') return res.status(400).json({ error: 'Missing jobId' });
  let status = exportStatus[jobId];
  let jobData: any = null;
  try {
    if (!status) {
      await connectMongo();
      const job = await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME).findOne({ jobId });
      if (job) {
        status = job.status;
        jobData = job;
      }
    }
    if (!status) status = 'unknown' as ExportJobStateType;
    if (status === ExportJobState.IN_PROGRESS) {
      return res.status(202).json({ jobId, status, job: jobData });
    }
    res.status(200).json({ jobId, status, job: jobData });
  } catch (err: any) {
    console.error('[API ERROR] /api/patient-export/status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/poll', async (req: Request, res: Response) => {
  console.log('[API] GET /api/patient-export/poll', req.query);
  const { pollUrl } = req.query;
  if (!pollUrl || typeof pollUrl !== 'string') return res.status(400).json({ error: 'Missing pollUrl' });
  try {
    const response: AxiosResponse = await axios.get(pollUrl, { headers: req.headers, validateStatus: () => true });
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/patient-export/poll:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.get('/latest', async (req: Request, res: Response) => {
  console.log('[API] GET /api/bulk-export/latest');
  try {
    await connectMongo();
    const latest = await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME)
      .find().sort({ timestamp: -1 }).limit(1).toArray();
    if (latest.length === 0) return res.status(404).json({ error: 'No export found' });
    res.json(latest[0]);
  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/latest:', err.message);
    res.status(500).json({ error: err.message });
  }
});


router.get('/ndjson/process', async (req: Request, res: Response) => {
  console.log('[API] GET /api/bulk-export/ndjson/process');
  try {
    const result = await processLatestBulkExportToNDJSON();
    if (result.success) {
      res.json({
        success: true,
        message: `Successfully processed ${result.files.length} files`,
        files: result.files
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/ndjson/process:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ndjson/files', async (req: Request, res: Response) => {
  console.log('[API] GET /api/bulk-export/ndjson/files');
  try {
    const files = getNDJSONFileList();
    res.json({
      success: true,
      files: files,
      count: files.length
    });
  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/ndjson/files:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ndjson/files/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  console.log(`[API] GET /api/bulk-export/ndjson/files/${filename}`);
  
  try {
    const result = getNDJSONFileContent(filename);
    if (result.success) {
      res.setHeader('Content-Type', 'application/ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(result.content);
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (err: any) {
    console.error(`[API ERROR] /api/bulk-export/ndjson/files/${filename}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req: Request, res: Response) => {
  console.log('[API] POST /api/bulk-export/import');
  
  let targetUrl: string = IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL;
  let availableFiles: string[] = [];
  
  try {
    const inputFormat = 'application/fhir+ndjson';
    const maxBatchSize = '500'; 
    
    if (!targetUrl) {
      return res.status(400).json({ error: 'targetUrl is required' });
    }

    availableFiles = getNDJSONFileList();
    if (availableFiles.length === 0) {
      return res.status(404).json({ error: 'No NDJSON files available. Please process an export first.' });
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

    console.log(`[IMPORT] Triggering import to ${targetUrl} with ${availableFiles.length} files`);
    console.log(JSON.stringify(importPayload, null, 2));  
    console.log(`${targetUrl}/$import`) 
    const response: AxiosResponse = await axios.post(`${targetUrl}/$import`, importPayload, {
      headers: {
        "Content-Type": "application/fhir+json",
        "Prefer": "respond-async"
      },
      validateStatus: () => true,
      timeout: 30000 // 30 second timeout
    });

    if (response.status === 202) {
      const statusUrl = response.headers["content-location"];
      console.log(`[IMPORT] Import triggered successfully. Status URL: ${statusUrl}`);
      
      res.json({
        success: true,
        message: "Import triggered successfully",
        statusUrl: statusUrl,
        files: availableFiles,
        targetUrl: targetUrl
      });
    } else {
      console.error(`[IMPORT ERROR] Failed to trigger import. Status: ${response.status}`);
      console.error(`[IMPORT ERROR] Response:`, response.data);
      
      res.status(response.status).json({
        success: false,
        error: `Failed to trigger import. Status: ${response.status}`,
        details: response.data
      });
    }

  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/import:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    // Use the variables that are now properly initialized
    const errorResponse = createErrorResponse(err, `${targetUrl}/$import`, 'local', { 
      files: availableFiles,
      targetUrl: targetUrl
    });
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/import/status', async (req: Request, res: Response) => {
  console.log('[API] GET /api/bulk-export/import/status');
  const { importJobId } = req.query;
  
  if (importJobId && typeof importJobId === 'string') {
    // Get specific import job status
    const importJob = await getImportStatus(importJobId);
    if (!importJob) {
      return res.status(404).json({ error: 'Import job not found' });
    }
    res.json(importJob);
  } else {
    // Get latest import status
    const latestImport = await getLatestImportStatus();
    if (!latestImport) {
      return res.status(404).json({ error: 'No import jobs found' });
    }
    res.json(latestImport);
  }
});

router.get('/import/status/latest', async (req: Request, res: Response) => {
  console.log('[API] GET /api/bulk-export/import/status/latest');
  try {
    const latestImport = await getLatestImportStatus();
    if (!latestImport) {
      return res.status(404).json({ error: 'No import jobs found' });
    }
    res.json(latestImport);
  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/import/status/latest:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/import/poll', async (req: Request, res: Response) => {
  console.log('[API] POST /api/bulk-export/import/poll');
  const { statusUrl, pollInterval = 3000 } = req.body;
  
  if (!statusUrl) {
    return res.status(400).json({ error: 'statusUrl is required' });
  }

  try {
    console.log(`[IMPORT POLL] Starting to poll ${statusUrl}`);
    
    let completed = false;
    let result: any = null;
    let attempts = 0;
    const maxAttempts = 100; 

    while (!completed && attempts < maxAttempts) {
      attempts++;
      
      const response: AxiosResponse = await axios.get(statusUrl, {
        headers: { "Accept": "application/json" },
        validateStatus: () => true
      });

      if (response.status === 202) {
        console.log(`[IMPORT POLL] Attempt ${attempts}: Import still in progress...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } else if (response.status === 200) {
        console.log(`[IMPORT POLL] Import completed successfully after ${attempts} attempts`);
        result = response.data;
        completed = true;
      } else {
        console.error(`[IMPORT POLL] Import failed with status ${response.status}`);
        return res.status(response.status).json({
          success: false,
          error: `Import failed with status ${response.status}`,
          details: response.data
        });
      }
    }

    if (!completed) {
      return res.status(408).json({
        success: false,
        error: 'Import polling timed out after maximum attempts'
      });
    }

    res.json({
      success: true,
      message: 'Import completed successfully',
      result: result,
      attempts: attempts
    });

  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/import/poll:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router; 