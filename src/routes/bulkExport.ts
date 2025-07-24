import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_DEFAULT_FHIR_URL, SERVER_URL } from '../config';
import { connectMongo, mongoDb } from '../services/mongo';
import {
  pollAndStoreBulkExport,
  extractJobId,
  exportStatus,
  ExportJobState,
  ExportJobStateType,
  decodeAndFilterRecords
} from '../services/bulkExportService';

const router = Router();
const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/patient-export', req.query);
  try {
    let typesToExport: string[] = (req.query.types as string | undefined)?.split(',') || ['Immunization', 'Condition'];
    const typeParam = typesToExport.length > 0 ? `?_type=${typesToExport.join(',')}` : '';
    const url = `${IMMUNIZATION_DEFAULT_FHIR_URL}/$export${typeParam}`;
    console.log(`[EXPORT START] ${url}`);
    const response: AxiosResponse = await axios.get(url, {
      headers: {
        'Accept': 'application/fhir+json',
        'Prefer': 'respond-async',
      },
      validateStatus: () => true,
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
    res.status(err.response?.status || 500).json({ error: err.message, url: err.config?.url });
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

router.get('/patient/:patientId', async (req: Request, res: Response) => {
  console.log(`[API] GET /api/bulk-export/patient/${req.params.patientId}`);
  const { patientId } = req.params;
  const { resourceType } = req.query;
  try {
    await connectMongo();
    const latest = await mongoDb!.collection(BULK_EXPORT_COLLECTION_NAME)
      .find({ status: ExportJobState.FINISHED })
      .sort({ finishedAt: -1 })
      .limit(1)
      .toArray();
    if (!latest.length) {
      console.error('[API ERROR] No finished export found');
      return res.status(404).json({ error: 'No finished export found' });
    }
    const binaries = latest[0].binaries;
    if (!binaries) {
      console.error('[API ERROR] No binaries found in latest export');
      return res.status(404).json({ error: 'No binaries found in latest export' });
    }
    const records = decodeAndFilterRecords(binaries, patientId);
    if (resourceType && typeof resourceType === 'string') {
      if (records[resourceType]) {
        return res.json({ [resourceType]: records[resourceType] });
      } else {
        return res.json({ [resourceType]: [] });
      }
    }
    res.json(records);
  } catch (err: any) {
    console.error(`[API ERROR] /api/bulk-export/patient/${req.params.patientId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router; 