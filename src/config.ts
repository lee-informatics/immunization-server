import dotenv from 'dotenv';
dotenv.config();

export const IMMUNIZATION_DEFAULT_FHIR_URL = process.env.IMMUNIZATION_DEFAULT_FHIR_URL || 'http://localhost:8080/fhir';
export const TEFCA_QHIN_DEFAULT_FHIR_URL = process.env.TEFCA_QHIN_DEFAULT_FHIR_URL || 'http://localhost:8081/fhir';
export const LOCAL_HAPI_SERVER_URL = process.env.TEFCA_QHIN_DEFAULT_FHIR_URL || 'http://localhost:8096/fhir';


export const MONGODB_HOST = process.env.MONGODB_HOST || 'localhost';
export const MONGODB_PORT = process.env.MONGODB_PORT || '27017';
export const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'immunization-dashboard';
export const MONGODB_USERNAME = process.env.MONGODB_USERNAME || '';
export const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD || '';
export const MONGODB_URI = process.env.MONGODB_URI || 
  (MONGODB_USERNAME && MONGODB_PASSWORD 
    ? `mongodb://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}`
    : `mongodb://${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}`); 
export const IMMUNIZATION_SERVER_URL = process.env.IMMUNIZATION_SERVER_URL || 'http://localhost:3000';