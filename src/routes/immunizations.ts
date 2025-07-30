import { Router, Request, Response } from 'express';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { immunizationCache, CACHE_TTL } from '../services/cacheService';
import { fetchAllPages } from '../utils/pagination';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/immunizations');
  const now = Date.now();
  if (immunizationCache.data && immunizationCache.timestamp && (now - immunizationCache.timestamp < CACHE_TTL)) {
    // Return all immunizations as a flat array from the cached data
    const allImmunizations = Object.values(immunizationCache.data).flat();
    return res.json(allImmunizations);
  }
  try {
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Immunization`;
    const allImmunizations = await fetchAllPages(url, { 'Accept': 'application/fhir+json', ...req.headers });
    // Don't cache the flat array - only cache the grouped data in the /:patientId route
    res.json(allImmunizations);
  } catch (err: any) {
    console.error('[API ERROR] /api/immunizations:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Immunization`, 'local');
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/:patientId', async (req: Request, res: Response) => {
  console.log(`[API] GET /api/immunizations/${req.params.patientId}`);
  const patientId = req.params.patientId;
  
  // Check if we have cached data for this specific patient
  const cacheKey = `patient_${patientId}`;
  const now = Date.now();
  if (immunizationCache.data && immunizationCache.data[cacheKey] && immunizationCache.timestamp && (now - immunizationCache.timestamp < CACHE_TTL)) {
    console.log('[API] Returning cached immunizations for patient:', patientId);
    return res.json(immunizationCache.data[cacheKey]);
  }
  
  // If cache is empty or expired, fetch and populate it
  console.log('[API] Cache empty or expired, fetching immunizations data for patient:', patientId);
  try {
    // Fetch all immunizations and filter by patient
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Immunization??patient=${patientId}`;
    console.log('[API] Fetching all immunizations with URL:', url);
    const allImmunizations = await fetchAllPages(url, { 'Accept': 'application/fhir+json', ...req.headers });
    console.log('[API] Fetched all immunizations from FHIR server:', allImmunizations.length);
    
    // Group immunizations by patient
    const immunizationsByPatient: { [patientId: string]: any[] } = {};
    allImmunizations.forEach((immunization: any) => {
      const ref = immunization.patient?.reference;
      if (ref && ref.startsWith('Patient/')) {
        const patientRefId = ref.replace('Patient/', '');
        if (!immunizationsByPatient[patientRefId]) {
          immunizationsByPatient[patientRefId] = [];
        }
        immunizationsByPatient[patientRefId].push(immunization);
      }
    });
    
    // Store in cache
    immunizationCache.data = immunizationsByPatient;
    immunizationCache.timestamp = now;
    
    // Return immunizations for the requested patient
    const patientImmunizations = immunizationsByPatient[patientId] || [];
    console.log('[API] Returning immunizations for patient:', patientId, 'count:', patientImmunizations.length);
    res.json(patientImmunizations);
  } catch (err: any) {
    console.error('[API ERROR] Failed to fetch immunizations for cache:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Immunization`, 'local', { patientId });
    const statusCode = getHttpStatus(err);
    
    return res.status(statusCode).json(errorResponse);
  }
});

export default router;