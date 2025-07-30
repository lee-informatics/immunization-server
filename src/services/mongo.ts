import { MongoClient, Db } from 'mongodb';

const IMMUNIZATION_SERVER_MONGODB_HOST = process.env.IMMUNIZATION_SERVER_MONGODB_HOST || 'localhost';
const IMMUNIZATION_SERVER_MONGODB_PORT = process.env.IMMUNIZATION_SERVER_MONGODB_PORT || '27017';
const IMMUNIZATION_SERVER_MONGODB_DATABASE = process.env.IMMUNIZATION_SERVER_MONGODB_DATABASE || 'immunization-dashboard';
const IMMUNIZATION_SERVER_MONGODB_USERNAME = process.env.IMMUNIZATION_SERVER_MONGODB_USERNAME || '';
const IMMUNIZATION_SERVER_MONGODB_PASSWORD = process.env.IMMUNIZATION_SERVER_MONGODB_PASSWORD || '';

const MONGO_URL = process.env.MONGO_URL || 
  (IMMUNIZATION_SERVER_MONGODB_USERNAME && IMMUNIZATION_SERVER_MONGODB_PASSWORD 
    ? `mongodb://${IMMUNIZATION_SERVER_MONGODB_USERNAME}:${IMMUNIZATION_SERVER_MONGODB_PASSWORD}@${IMMUNIZATION_SERVER_MONGODB_HOST}:${IMMUNIZATION_SERVER_MONGODB_PORT}`
    : `mongodb://${IMMUNIZATION_SERVER_MONGODB_HOST}:${IMMUNIZATION_SERVER_MONGODB_PORT}`);
const DB_NAME = IMMUNIZATION_SERVER_MONGODB_DATABASE;

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


export function getMongoDb(): Db {
  if (!mongoDb) {
    console.log("[MONGO ERROR] MongoDB connection not available")
    throw new Error('MongoDB connection not available');
  }
  return mongoDb;
}

export { mongoClient, mongoDb }; 