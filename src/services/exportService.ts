import axios, { AxiosResponse } from 'axios';
import { mongoDb, connectMongo } from './mongo';
import { ExportJobState, ExportJobStateType } from '../types';
import { fetchAndStoreBinaries } from './binaryService';

const BULK_EXPORT_COLLECTION_NAME = 'bulk_exports';

export function extractJobId(pollUrl: string): string {
  const match = pollUrl.match(/_jobId=([\w-]+)/);
  return match ? match[1] : pollUrl;
}

export let exportStatus: Record<string, ExportJobStateType> = {};

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