import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';

const router = Router();

router.get('/', async (req, res) => {
  console.log(`[API] GET /api/patients count=${req.query.count || 100}`);
  try {
    const count = req.query.count || 100;
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Patient?_count=${count}`;
    console.log(`[API] Fetching patients from: ${url}`);
    
    const response: AxiosResponse = await axios.get(url, { 
      headers: req.headers,
      timeout: 30000 // 30 second timeout
    });
    
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/patients:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Patient`, 'local');
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/:patientId', async (req: Request, res: Response) => {
  const { patientId } = req.params;
  console.log(`[API] GET /api/patients/${patientId}`);
  
  try {
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Patient/${patientId}`;
    console.log(`[API] Fetching patient from: ${url}`);
    
    const response: AxiosResponse = await axios.get(url, { 
      headers: {
        'Accept': 'application/fhir+json',
        ...req.headers
      },
      validateStatus: () => true,
      timeout: 30000 // 30 second timeout
    });
    
    console.log(`[API] Patient fetch response status: ${response.status}`);
    
    if (response.status === 404) {
      return res.status(404).json({ 
        error: 'Patient not found',
        details: `No patient found with ID: ${patientId}`,
        patientId: patientId,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error(`[API ERROR] /api/patients/${patientId}:`, err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Patient/${patientId}`, 'local', { patientId });
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

export default router; 