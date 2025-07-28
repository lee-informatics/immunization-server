import { MongoClient, Db } from 'mongodb';

const MONGODB_HOST = process.env.MONGODB_HOST || 'localhost';
const MONGODB_PORT = process.env.MONGODB_PORT || '27017';
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'immunization-dashboard';
const MONGODB_USERNAME = process.env.MONGODB_USERNAME || '';
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD || '';

const MONGO_URL = process.env.MONGO_URL || 
  (MONGODB_USERNAME && MONGODB_PASSWORD 
    ? `mongodb://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}:${MONGODB_PORT}`
    : `mongodb://${MONGODB_HOST}:${MONGODB_PORT}`);
const DB_NAME = MONGODB_DATABASE;

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