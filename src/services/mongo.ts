import { MongoClient, Db } from 'mongodb';

const {
  IMMUNIZATION_SERVER_MONGODB_HOST = 'localhost',
  IMMUNIZATION_SERVER_MONGODB_PORT = '27017',
  IMMUNIZATION_SERVER_MONGODB_DATABASE = 'immunization-dashboard',
  IMMUNIZATION_SERVER_MONGODB_USERNAME = '',
  IMMUNIZATION_SERVER_MONGODB_PASSWORD = '',
  MONGO_URL: ENV_MONGO_URL
} = process.env;

const isAuth = IMMUNIZATION_SERVER_MONGODB_USERNAME && IMMUNIZATION_SERVER_MONGODB_PASSWORD;

const MONGO_URL = ENV_MONGO_URL || (
  isAuth
    ? `mongodb://${IMMUNIZATION_SERVER_MONGODB_USERNAME}:${IMMUNIZATION_SERVER_MONGODB_PASSWORD}@${IMMUNIZATION_SERVER_MONGODB_HOST}:${IMMUNIZATION_SERVER_MONGODB_PORT}`
    : `mongodb://${IMMUNIZATION_SERVER_MONGODB_HOST}:${IMMUNIZATION_SERVER_MONGODB_PORT}`
);

const DB_NAME = IMMUNIZATION_SERVER_MONGODB_DATABASE;

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

export async function connectMongo(): Promise<void> {
  if (mongoClient && mongoDb) return;

  try {
    mongoClient = new MongoClient(MONGO_URL, { connectTimeoutMS: 5000 });
    await mongoClient.connect();
    mongoDb = mongoClient.db(DB_NAME);
    console.log(`[MONGO] Connected to ${MONGO_URL}, using DB: ${DB_NAME}`);
  } catch (err: any) {
    console.error(`[MONGO ERROR] Connection failed: ${err.message}`);
    mongoClient = null;
    mongoDb = null;
    throw err;
  }
}

export function getMongoDb(): Db {
  if (!mongoDb) {
    console.error('[MONGO ERROR] No database connection. Call connectMongo() first.');
    throw new Error('MongoDB connection not established');
  }
  return mongoDb;
}

export { mongoClient, mongoDb };