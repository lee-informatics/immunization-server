import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_IIS_FHIR_URL, IMMUNIZATION_SERVER_URL, IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { connectMongo, getMongoDb } from '../services/mongo';
import { ExportJobState, ExportJobStateType } from '../types';
import {
  pollAndStoreBulkExport,
  extractJobId,
  exportStatus
} from '../services/exportService';
import {
  getNDJSONFileList,
  getNDJSONFileContent
} from '../services/ndjsonService';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';

const router = Router();
const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/patient-export', req.query);
  try {
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
  let mongoError = false;
  
  try {
    await connectMongo();
    const db = getMongoDb();
    const job = await db.collection(BULK_EXPORT_COLLECTION_NAME).findOne({ jobId });
    if (job) {
      status = job.status;
      jobData = job;
    }
  } catch (err: any) {
    console.error('[API ERROR] /api/patient-export/status - MongoDB connection failed:', err.message);
    mongoError = true;
    // If MongoDB fails, return 503 regardless of in-memory status
    return res.status(503).json({ 
      error: 'Database connection failed', 
      jobId, 
      status: status || 'unknown',
      mongoError: true,
      details: err.message
    });
  }
  
  // If we have a status (either from MongoDB or in-memory)
  if (!status) {
    status = 'unknown' as ExportJobStateType;
  }
  
  if (status === ExportJobState.IN_PROGRESS) {
    return res.status(202).json({ 
      jobId, 
      status, 
      job: jobData,
      mongoError 
    });
  }
  
  res.status(200).json({ 
    jobId, 
    status, 
    job: jobData,
    mongoError 
  });
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
    const db = getMongoDb();
    const latest = await db.collection(BULK_EXPORT_COLLECTION_NAME)
      .find().sort({ timestamp: -1 }).limit(1).toArray();
    if (latest.length === 0) return res.status(404).json({ error: 'No export found' });
    res.json(latest[0]);
  } catch (err: any) {
    console.error('[API ERROR] /api/bulk-export/latest - MongoDB connection failed:', err.message);
    res.status(503).json({ 
      error: 'Database connection failed', 
      details: err.message 
    });
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

export default router; 