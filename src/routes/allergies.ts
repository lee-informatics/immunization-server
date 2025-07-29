import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_TEFCA_QHIN_DEFAULT_FHIR_URL } from '../config';
import { allergyCache, ALLERGY_CACHE_TTL } from '../services/allergyCache';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  console.log('[API] GET /api/allergies');
  const now = Date.now();
  if (allergyCache.data && allergyCache.timestamp && (now - allergyCache.timestamp < ALLERGY_CACHE_TTL)) {
    return res.json(allergyCache.data);
  }
  try {
    const url = `${IMMUNIZATION_SERVER_TEFCA_QHIN_DEFAULT_FHIR_URL}/AllergyIntolerance`;
    const response: AxiosResponse = await axios.get(url, { headers: { 'Accept': 'application/fhir+json', ...req.headers } });
    const data = response.data;
    const allAllergies = Array.isArray(data.entry) ? data.entry.map((e: any) => e.resource) : [];
    allergyCache.data = allAllergies;
    allergyCache.timestamp = now;
    res.json(allAllergies);
  } catch (err: any) {
    console.error('[API ERROR] /api/allergies:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.get('/:patientId', (req: Request, res: Response) => {
  console.log(`[API] GET /api/allergies/${req.params.patientId}`);
  const patientId = req.params.patientId;
  if (!allergyCache.data) return res.json([]);
  const allergies = allergyCache.data.filter(
    (allergy: any) => {
      const ref = allergy.patient?.reference;
      return ref === `Patient/${patientId}`;
    }
  );
  res.json(allergies);
});

export default router; 