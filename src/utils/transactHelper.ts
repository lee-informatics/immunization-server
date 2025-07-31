import { getMongoDb } from '../services/mongo';
import { ExportJobStateType } from '../types';

async function updateTransactionStatus(jobId: string, status: ExportJobStateType, additionalFields: any = {}) {
    try {
      const db = getMongoDb();
      const result = await db.collection('transactions').updateOne(
        { jobId },
        { $set: { status, updatedAt: new Date(), ...additionalFields } },
        { upsert: true }
      );
      console.log(`[TX UPDATE] jobId=${jobId} => ${status}. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    } catch (err: any) {
      console.error(`[TX ERROR] Failed to update status for jobId=${jobId}:`, err.message);
      throw err;
    }
  }

export default updateTransactionStatus; 