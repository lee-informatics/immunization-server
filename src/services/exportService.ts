import axios, { AxiosResponse } from 'axios';
import { connectMongo, getMongoDb } from './mongo';
import { ExportJobState, ExportJobStateType } from '../types';

const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';

export function extractJobId(pollUrl: string): string {
  const match = pollUrl.match(/_jobId=([\w-]+)/);
  return match ? match[1] : pollUrl;
}

export let exportStatus: Record<string, ExportJobStateType> = {};

export async function pollAndStoreBulkExport(jobId: string, pollUrl: string): Promise<void> {
  exportStatus[jobId] = ExportJobState.IN_PROGRESS;

  try {
    await connectMongo();
    const db = getMongoDb();

    // Initial DB status update
    await db.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
      { jobId },
      { $set: { jobId, status: ExportJobState.IN_PROGRESS, data: {}, startedAt: new Date() } },
      { upsert: true }
    );

    while (true) {
      let response: AxiosResponse;

      try {
        response = await axios.get(pollUrl, { validateStatus: () => true });
      } catch (err: any) {
        await markJobFailed(db, jobId, `Polling failed: ${err.message}`);
        return;
      }

      const statusCode = response.status;
      const errorMsg = response.data?.issue?.[0]?.diagnostics || '';

      console.log(`[EXPORT POLL] jobId: ${jobId} status: ${statusCode} pollUrl: ${pollUrl}`);

      if (statusCode === 202) {
        await delay(10000);
        continue;
      }

      if (statusCode === 200) {
        console.log("response.data",response.data)
        await markJobFinished(db, jobId, response.data);
        return;
      }

      await markJobFailed(db, jobId, `FHIR server returned ${statusCode}: ${errorMsg}`);
      return;
    }

  } catch (err: any) {
    console.error(`[EXPORT ERROR] jobId: ${jobId} critical failure: ${err.message}`);
    try {
      const db = getMongoDb();
      await markJobFailed(db, jobId, `Unexpected error: ${err.message}`);
    } catch (dbErr) {
      console.error(`[EXPORT ERROR] Could not update DB for jobId: ${jobId}`, dbErr);
    }
  }
}


function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function markJobFinished(db: any, jobId: string, data: any): Promise<void> {
  exportStatus[jobId] = ExportJobState.FINISHED;
  await db.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
    { jobId },
    {
      $set: {
        status: ExportJobState.FINISHED,
        data,
        finishedAt: new Date()
      }
    }
  );
  console.log(`[EXPORT DONE] jobId: ${jobId} marked as FINISHED`);
}

async function markJobFailed(db: any, jobId: string, reason: string): Promise<void> {
  exportStatus[jobId] = ExportJobState.FAILED;
  await db.collection(BULK_EXPORT_COLLECTION_NAME).updateOne(
    { jobId },
    {
      $set: {
        status: ExportJobState.FAILED,
        error: reason,
        finishedAt: new Date()
      }
    }
  );
  console.error(`[EXPORT FAILED] jobId: ${jobId} reason: ${reason}`);
}