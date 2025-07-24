import axios, { AxiosResponse } from 'axios';
import { mongoDb, connectMongo } from './mongo';

export const ExportJobState = {
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
  FAILED: 'FAILED',
} as const;
export type ExportJobStateType = typeof ExportJobState[keyof typeof ExportJobState];

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

export async function fetchAndStoreBinaries(output: any[]): Promise<Record<string, any[]>> {
  const binaries: Record<string, any[]> = {};
  for (const entry of output) {
    if (entry.type && entry.url) {
      if (!binaries[entry.type]) binaries[entry.type] = [];
      try {
        const response: AxiosResponse = await axios.get(entry.url, { headers: { 'Accept': 'application/fhir+json' } });
        if (response.data) {
          binaries[entry.type].push(response.data);
        }
      } catch (err: any) {
        console.error(`[BINARY ERROR] url: ${entry.url} err:`, err.message);
      }
    }
  }
  return binaries;
}

export function decodeAndFilterRecords(binaries: Record<string, any[]>, patientId: string): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const type in binaries) {
    result[type] = [];
    for (const binary of binaries[type]) {
      if (!binary.data) continue;
      let decoded: string;
      try {
        decoded = Buffer.from(binary.data, 'base64').toString('utf-8');
      } catch (e) {
        continue;
      }
      const lines = decoded.trim().split(/\r?\n/);
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const ref = record.patient?.reference || record.subject?.reference;
          if (ref === `Patient/${patientId}`) {
            result[type].push(record);
          }
        } catch (e) {}
      }
    }
    if (result[type].length === 0) delete result[type];
  }
  return result;
} 