import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { immunizationCache } from '../services/immunizationCache';
import { conditionCache } from '../services/conditionCache';
import { IMMUNIZATION_SERVER_IIS_FHIR_URL } from '../config';

const router = Router();

router.post('/immunization', async (req: Request, res: Response) => {
  try {
    const immunizationResource = req.body;
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Immunization`;
    const response: AxiosResponse = await axios.post(url, immunizationResource, {
      headers: { 'Content-Type': 'application/fhir+json' },
    });
    
    // Clear immunization cache since new data was added
    console.log('[API] Clearing immunization cache after new immunization administration');
    immunizationCache.data = undefined;
    immunizationCache.timestamp = undefined;
    
    // Clear condition cache as well since immunizations might affect condition status
    console.log('[API] Clearing condition cache after new immunization administration');
    conditionCache.data = undefined;
    conditionCache.timestamp = undefined;
    
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/administer/immunization:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.post('/medication', async (req: Request, res: Response) => {
  try {
    const medicationResource = req.body;
    console.log(medicationResource)
    const url = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/MedicationAdministration`;
    const response: AxiosResponse = await axios.post(url, medicationResource, {
      headers: { 'Content-Type': 'application/fhir+json' },
    });
    

    console.log('[API] Clearing immunization and condition caches after new medication administration');
    immunizationCache.data = undefined;
    immunizationCache.timestamp = undefined;
    conditionCache.data = undefined;
    conditionCache.timestamp = undefined;
    
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/administer/medication:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

export default router; 