import dotenv from 'dotenv';
dotenv.config();

export const IMMUNIZATION_SERVER_IIS_FHIR_URL = process.env.IMMUNIZATION_SERVER_IIS_FHIR_URL || 'http://localhost:8080/fhir';
export const IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL = process.env.IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL || 'http://localhost:8081/fhir';
export const IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL = process.env.IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL || 'http://localhost:8096/fhir';


export const IMMUNIZATION_SERVER_URL = process.env.IMMUNIZATION_SERVER_URL || 'http://localhost:3000';
