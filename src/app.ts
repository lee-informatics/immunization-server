import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import patientsRouter from './routes/patients';
import bulkExportRouter from './routes/bulkExport';
import allergiesRouter from './routes/allergies';
import conditionsRouter from './routes/conditions';
import immunizationsRouter from './routes/immunizations';
import staticDataRouter from './routes/staticData';
import administerRouter from './routes/administration';
import { allergyCache } from './services/allergyCache';
import { conditionCache } from './services/conditionCache';
import { immunizationCache } from './services/immunizationCache';
import { exportStatus, importStatus } from './services/bulkExportService';

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

export default app; 