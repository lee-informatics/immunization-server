import { Router, Request, Response } from 'express';
import { IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL, IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { allergyCache, CACHE_TTL } from '../services/cacheService';
import { fetchAllPages } from '../utils/pagination';
import { createErrorResponse, getHttpStatus } from '../utils/errorHandler';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/allergies');
  const now = Date.now();
  if (allergyCache.data && allergyCache.timestamp && (now - allergyCache.timestamp < CACHE_TTL)) {
    // Return all allergies as a flat array from the cached data
    const allAllergies = Object.values(allergyCache.data).flat();
    return res.json(allAllergies);
  }
  try {
    const url = `${IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL}/AllergyIntolerance`;
    const allAllergies = await fetchAllPages(url, { 'Accept': 'application/fhir+json', ...req.headers });
    // Don't cache the flat array - only cache the grouped data in the /:patientId route
    res.json(allAllergies);
  } catch (err: any) {
    console.error('[API ERROR] /api/allergies:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL}/AllergyIntolerance`, 'tefca');
    const statusCode = getHttpStatus(err);
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/:patientId', async (req: Request, res: Response) => {
  console.log(`[API] GET /api/allergies/${req.params.patientId}`);
  const patientId = req.params.patientId;
  
  // Check if we have cached data for this specific patient
  const cacheKey = `patient_${patientId}`;
  const now = Date.now();
  if (allergyCache.data && allergyCache.data[cacheKey] && allergyCache.timestamp && (now - allergyCache.timestamp < CACHE_TTL)) {
    console.log('[API] Returning cached allergies for patient:', patientId);
    return res.json(allergyCache.data[cacheKey]);
  }
  
  // If cache is empty or expired, fetch and populate it
  console.log('[API] Cache empty or expired, fetching allergies data for patient:', patientId);
  try {
    // Fetch all allergies and filter by patient
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/AllergyIntolerance?patient=${patientId}`;
    console.log('[API] Fetching all allergies with URL:', url);
    const allAllergies = await fetchAllPages(url, { 'Accept': 'application/fhir+json', ...req.headers });
    console.log('[API] Fetched all allergies from FHIR server:', allAllergies.length);
    
    // Group allergies by patient
    const allergiesByPatient: { [patientId: string]: any[] } = {};
    allAllergies.forEach((allergy: any) => {
      const ref = allergy.patient?.reference;
      if (ref && ref.startsWith('Patient/')) {
        const patientRefId = ref.replace('Patient/', '');
        if (!allergiesByPatient[patientRefId]) {
          allergiesByPatient[patientRefId] = [];
        }
        allergiesByPatient[patientRefId].push(allergy);
      }
    });
    
    // Store in cache
    allergyCache.data = allergiesByPatient;
    allergyCache.timestamp = now;
    
    // Return allergies for the requested patient
    const patientAllergies = allergiesByPatient[patientId] || [];
    console.log('[API] Returning allergies for patient:', patientId, 'count:', patientAllergies.length);
    res.json(patientAllergies);
  } catch (err: any) {
    console.error('[API ERROR] Failed to fetch allergies for cache:', err.message);
    if (err.code) {
      console.error('[API ERROR] Error code:', err.code);
    }
    
    const errorResponse = createErrorResponse(err, `${IMMUNIZATION_SERVER_TEFCA_QHIN_FHIR_URL}/AllergyIntolerance`, 'tefca', { patientId });
    const statusCode = getHttpStatus(err);
    
    return res.status(statusCode).json(errorResponse);
  }
});

export default router; 