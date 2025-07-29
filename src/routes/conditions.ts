import { Router, Request, Response } from 'express';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { conditionCache, CONDITION_CACHE_TTL } from '../services/conditionCache';
import { fetchAllPages } from '../utils/pagination';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/conditions');
  const now = Date.now();
  if (conditionCache.data && conditionCache.timestamp && (now - conditionCache.timestamp < CONDITION_CACHE_TTL)) {
    // Return all conditions as a flat array from the cached data
    const allConditions = Object.values(conditionCache.data).flat();
    return res.json(allConditions);
  }
  try {
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Condition`;
    const allConditions = await fetchAllPages(url, { 'Accept': 'application/fhir+json', ...req.headers });
    // Don't cache the flat array - only cache the grouped data in the /:patientId route
    res.json(allConditions);
  } catch (err: any) {
    console.error('[API ERROR] /api/conditions:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Condition`, 'local');
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/:patientId', async (req: Request, res: Response) => {
  console.log(`[API] GET /api/conditions/${req.params.patientId}`);
  const patientId = req.params.patientId;
  
  // Check if we have cached data for this specific patient
  const cacheKey = `patient_${patientId}`;
  const now = Date.now();
  if (conditionCache.data && conditionCache.data[cacheKey] && conditionCache.timestamp && (now - conditionCache.timestamp < CONDITION_CACHE_TTL)) {
    console.log('[API] Returning cached conditions for patient:', patientId);
    return res.json(conditionCache.data[cacheKey]);
  }
  
  // If cache is empty or expired, fetch and populate it
  console.log('[API] Cache empty or expired, fetching conditions data for patient:', patientId);
  try {
    // Fetch all conditions and filter by patient
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Condition?patient=${patientId}`;
    console.log('[API] Fetching all conditions with URL:', url);
    const allConditions = await fetchAllPages(url, { 'Accept': 'application/fhir+json', ...req.headers });
    console.log('[API] Fetched all conditions from FHIR server:', allConditions.length);
    
    // Group conditions by patient
    const conditionsByPatient: { [patientId: string]: any[] } = {};
    allConditions.forEach((condition: any) => {
      const ref = condition.subject?.reference;
      if (ref && ref.startsWith('Patient/')) {
        const patientRefId = ref.replace('Patient/', '');
        if (!conditionsByPatient[patientRefId]) {
          conditionsByPatient[patientRefId] = [];
        }
        conditionsByPatient[patientRefId].push(condition);
      }
    });
    
    // Store in cache
    conditionCache.data = conditionsByPatient;
    conditionCache.timestamp = now;
    
    // Return conditions for the requested patient
    const patientConditions = conditionsByPatient[patientId] || [];
    console.log('[API] Returning conditions for patient:', patientId, 'count:', patientConditions.length);
    res.json(patientConditions);
  } catch (err: any) {
    console.error('[API ERROR] Failed to fetch conditions for cache:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Condition`, 'local', { patientId });
    const statusCode = getHttpStatus(err);
    
    return res.status(statusCode).json(errorResponse);
  }
});

export default router;