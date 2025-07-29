import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_IIS_FHIR_URL } from '../config';

const router = Router();

router.post('/immunization', async (req: Request, res: Response) => {
  try {
    const immunizationResource = req.body;
    const url = `${IMMUNIZATION_SERVER_IIS_FHIR_URL}/Immunization`;
    const response: AxiosResponse = await axios.post(url, immunizationResource, {
      headers: { 'Content-Type': 'application/fhir+json' },
    });
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/immunizations:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.post('/medication', async (req: Request, res: Response) => {
  try {
    const medicationResource = req.body;
    console.log(medicationResource)
    const url = `${IMMUNIZATION_SERVER_IIS_FHIR_URL}/MedicationAdministration`;
    const response: AxiosResponse = await axios.post(url, medicationResource, {
      headers: { 'Content-Type': 'application/fhir+json' },
    });
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/medications:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

export default router; 