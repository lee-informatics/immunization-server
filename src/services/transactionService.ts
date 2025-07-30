import { v4 as uuidv4 } from 'uuid';
import { mongoDb, connectMongo } from './mongo';
import { ExportJobState } from '../types';
import { processLatestBulkExportToNDJSON } from './ndjsonService';
import { processTransactionAsync } from '../routes/transact';

export async function triggerTransaction(jobId: string = uuidv4()): Promise<void> {
  try {
    console.log(`[AUTO TRANSACTION] Starting auto-transaction for export job`);
    
    // Process the export to NDJSON first
    const processResult = await processLatestBulkExportToNDJSON();
    if (!processResult.success) {
      console.error(`[AUTO TRANSACTION] Failed to process export to NDJSON: ${processResult.error}`);
      return;
    }
    // Store transaction job in MongoDB
    await connectMongo();
    if (!mongoDb) {
      console.error(`[AUTO TRANSACTION] MongoDB connection not available for jobId: ${jobId}`);
      throw new Error('Database connection not available');
    }
    await mongoDb.collection('transactions').updateOne(
      { jobId },
      { $set: { jobId, status: ExportJobState.IN_PROGRESS, createdAt: new Date(), type: 'transaction' } },
      { upsert: true }
    );
    
    // Start async processing using the existing transaction logic
    await processTransactionAsync(jobId);
    
    console.log(`[AUTO TRANSACTION] Transaction triggered successfully. JobId: ${jobId}`);
  } catch (err: any) {
    console.error(`[AUTO TRANSACTION ERROR] Failed to trigger auto-transaction:`, err.message);
  }
} 