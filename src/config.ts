import dotenv from 'dotenv';
dotenv.config();

export const IMMUNIZATION_DEFAULT_FHIR_URL = process.env.IMMUNIZATION_DEFAULT_FHIR_URL || 'http://localhost:8080/fhir';
export const TEFCA_QHIN_DEFAULT_FHIR_URL = process.env.TEFCA_QHIN_DEFAULT_FHIR_URL || 'http://localhost:8081/fhir';
export const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'; 