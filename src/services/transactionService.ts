import { connectMongo, getMongoDb } from './mongo';
import { ExportJobState } from '../types';
import { processExportToNDJSON } from './ndjsonService';
import { processTransactionAsync } from '../routes/transact';
import updateTransactionStatus from '../utils/transactHelper'
export async function triggerTransaction(jobId: string, exportJobId: string): Promise<void> {
  console.log(`[AUTO TRANSACTION] Starting transaction for job: ${exportJobId}`);

  try {
    await connectMongo();
    getMongoDb(); // Ensure DB is connected

    // Insert or reset the transaction record to IN_PROGRESS
    await updateTransactionStatus(jobId, ExportJobState.IN_PROGRESS, {
      jobId,
      exportJobId,
      createdAt: new Date(),
      type: 'transaction'
    });

    // Process NDJSON files
    const processResult = await processExportToNDJSON(exportJobId);
    console.log(`[AUTO TRANSACTION] NDJSON result:`, processResult);

    if (!processResult.success) {
      await updateTransactionStatus(jobId, ExportJobState.FAILED, {
        completedAt: new Date(),
        error: processResult.error || 'NDJSON processing failed'
      });
      return;
    }

    console.log(`[AUTO TRANSACTION] NDJSON processed. Proceeding with transaction...`);
    await processTransactionAsync(jobId);

  } catch (err: any) {
    console.error(`[AUTO TRANSACTION ERROR] jobId=${jobId}:`, err.message);
    try {
      await updateTransactionStatus(jobId, ExportJobState.FAILED, {
        completedAt: new Date(),
        error: err.message
      });
    } catch (e) {
      console.error(`[TX ERROR] Failed to record FAILED status for jobId=${jobId}`, e);
    }
  }
}