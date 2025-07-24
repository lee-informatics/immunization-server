import { MongoClient, Db } from 'mongodb';

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = 'immunization-dashboard';

let mongoClient: MongoClient | undefined;
let mongoDb: Db | undefined;

export async function connectMongo(): Promise<void> {
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(MONGO_URL);
      await mongoClient.connect();
      mongoDb = mongoClient.db(DB_NAME);
      console.log(`[MONGO] Connected to ${MONGO_URL}, DB: ${DB_NAME}`);
    }
  } catch (err: any) {
    console.error('[MONGO ERROR] Failed to connect:', err.message);
    throw err;
  }
}

export { mongoClient, mongoDb }; 