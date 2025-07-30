import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import patientsRouter from './routes/patients';
import bulkExportRouter from './routes/bulkExport';
import allergiesRouter from './routes/allergies';
import conditionsRouter from './routes/conditions';
import immunizationsRouter from './routes/immunizations';
import staticDataRouter from './routes/staticData';
import administerRouter from './routes/administration';
import transactRouter from './routes/transact';
import { allergyCache } from './services/allergyCache';
import { conditionCache } from './services/conditionCache';
import { immunizationCache } from './services/immunizationCache';
import { exportStatus } from './services/exportService';
import { mongoDb } from './services/mongo';
import { IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL } from './config';


const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use('/api/patients', patientsRouter);
app.use('/api/patient-export', bulkExportRouter);
app.use('/api/bulk-export', bulkExportRouter);
app.use('/api/allergies', allergiesRouter);
app.use('/api/conditions', conditionsRouter);
app.use('/api/immunizations', immunizationsRouter);
app.use('/api', staticDataRouter);
app.use('/api/administer', administerRouter);
app.use('/api/transact', transactRouter);

app.use('/exports', express.static(path.join(process.cwd(), 'exports')));

app.delete('/api/cache', (req, res) => {
  console.log('[API] DELETE /api/cache - Clearing all caches');
  
  // Clear allergy cache
  allergyCache.data = undefined;
  allergyCache.timestamp = undefined;
  
  // Clear condition cache
  conditionCache.data = undefined;
  conditionCache.timestamp = undefined;
  
  // Clear immunization cache
  immunizationCache.data = undefined;
  immunizationCache.timestamp = undefined;
  
  // Clear export status cache
  Object.keys(exportStatus).forEach(key => delete exportStatus[key]);
  
  res.json({ 
    message: 'All caches cleared successfully',
    cleared: {
      allergyCache: true,
      conditionCache: true,
      immunizationCache: true,
      exportStatusCache: true
    }
  });
});

app.post('/api/reset', async (req, res) => {
  console.log('[API] POST /api/reset - Resetting dashboard data');
  
  try {
    // Clear all caches
    allergyCache.data = undefined;
    allergyCache.timestamp = undefined;
    conditionCache.data = undefined;
    conditionCache.timestamp = undefined;
    immunizationCache.data = undefined;
    immunizationCache.timestamp = undefined;
    Object.keys(exportStatus).forEach(key => delete exportStatus[key]);
    
    // Call FHIR expunge operation
    try {
      const fhirServerUrl = IMMUNIZATION_SERVER_LOCAL_HAPI_SERVER_URL;
      const expungeResponse = await axios.post(`${fhirServerUrl}/$expunge`, {
        resourceType: "Parameters",
        parameter: [
          { name: "expungeEverything", valueBoolean: true }
        ]
      }, {
        headers: {
          'Content-Type': 'application/fhir+json'
        }
      });
      console.log('[RESET] FHIR expunge successful:', expungeResponse.status);
    } catch (fhirError) {
      console.error('[RESET] FHIR expunge failed:', fhirError instanceof Error ? fhirError.message : 'Unknown error');
      // Continue with other reset operations even if FHIR expunge fails
    }
    
    // Clear MongoDB collections
    if (mongoDb) {
      const collections = await mongoDb.listCollections().toArray();
      for (const collection of collections) {
        await mongoDb.collection(collection.name).deleteMany({});
        console.log(`[RESET] Cleared collection: ${collection.name}`);
      }
    }
    
    // Clear exports folder
    const exportsPath = path.join(process.cwd(), 'exports');
    if (fs.existsSync(exportsPath)) {
      const files = fs.readdirSync(exportsPath);
      for (const file of files) {
        const filePath = path.join(exportsPath, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          console.log(`[RESET] Deleted file: ${file}`);
        }
      }
    }
    
    res.json({ 
      message: 'Dashboard reset successfully',
      cleared: {
        caches: true,
        fhirData: true,
        mongoCollections: true,
        exportsFolder: true
      }
    });
  } catch (error) {
    console.error('[RESET ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to reset dashboard',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default app; 