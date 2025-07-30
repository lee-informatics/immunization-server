import { mongoDb, connectMongo, getMongoDb } from './mongo';
import { ExportJobState } from '../types';
import { processExportToNDJSON } from './ndjsonService';
import { processTransactionAsync } from '../routes/transact';

export async function triggerTransaction(jobId: string, exportJobId: string): Promise<void> {
  try {
    console.log(`[AUTO TRANSACTION] Starting auto-transaction for export job: ${exportJobId}`);
    
    // Process the export to NDJSON first
    const processResult = await processExportToNDJSON(exportJobId);
    console.log(`[AUTO TRANSACTION] NDJSON process result:`, processResult);
    
    if (!processResult.success) {
      console.error(`[AUTO TRANSACTION] Failed to process export to NDJSON: ${processResult.error}`);
      return;
    }
    
    console.log(`[AUTO TRANSACTION] NDJSON processing completed successfully. Starting transaction processing...`);
    
    // Store transaction job in MongoDB
    await connectMongo();
    if (!mongoDb) {
      console.error(`[AUTO TRANSACTION] MongoDB connection not available for jobId: ${jobId}`);
      throw new Error('Database connection not available');
    }
    const db = getMongoDb();
    await db.collection('transactions').updateOne(
      { jobId },
      { $set: { jobId, exportJobId, status: ExportJobState.IN_PROGRESS, createdAt: new Date(), type: 'transaction' } },
      { upsert: true }
    );
    
    console.log(`[AUTO TRANSACTION] Transaction record stored in MongoDB. Starting async processing...`);
    
    // Start async processing using the existing transaction logic
    await processTransactionAsync(jobId);
    
    console.log(`[AUTO TRANSACTION] Transaction triggered successfully. JobId: ${jobId}`);
  } catch (err: any) {
    console.error(`[AUTO TRANSACTION ERROR] Failed to trigger auto-transaction:`, err.message);
    throw err; // Re-throw the error
  }
} 