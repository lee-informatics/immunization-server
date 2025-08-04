import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from '../config';
import { conditionCache, immunizationCache } from '../services/cacheService';

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
    
    // Read practitioners from local JSON file
    const practitionersPath = path.join(__dirname, '../data/practitioners.json');
    const practitionersData = JSON.parse(fs.readFileSync(practitionersPath, 'utf8'));
    
    // Get the single practitioner object
    const practitioner = practitionersData[0];
    
    if (!practitioner || !practitioner.name || !practitioner.name[0] || !practitioner.name[0].given) {
      throw new Error('Invalid practitioner data in JSON file');
    }
    
    // Get the practitioner's given name
    const practitionerGivenName = practitioner.name[0].given[0];
    console.log('Practitioner given name:', practitionerGivenName);
    
    // Fetch practitioner ID from API using the name
    const practitionerUrl = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/Practitioner?given=${practitionerGivenName}`;
    const practitionerResponse: AxiosResponse = await axios.get(practitionerUrl);
    const practitionerId = practitionerResponse.data.entry?.[0]?.resource?.id;
    
    if (!practitionerId) {
      throw new Error(`Practitioner with name ${practitionerGivenName} not found in API`);
    }
    
    console.log('Extracted practitioner ID from API:', practitionerId);
    
    // Update the medication resource to use the extracted practitioner ID
    if (medicationResource.performer && medicationResource.performer.length > 0) {
      medicationResource.performer[0].actor.reference = `Practitioner/${practitionerId}`;
    }
    
    const medicationUrl = `${IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL}/MedicationAdministration`;
    const response: AxiosResponse = await axios.post(medicationUrl, medicationResource, {
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
