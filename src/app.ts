import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import patientsRouter from './routes/patients';
import bulkExportRouter from './routes/bulkExport';
import allergiesRouter from './routes/allergies';
import staticDataRouter from './routes/staticData';
import administerRouter from './routes/administration';
import { allergyCache } from './services/allergyCache';
import { exportStatus } from './services/bulkExportService';

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use('/api/patients', patientsRouter);
app.use('/api/patient-export', bulkExportRouter);
app.use('/api/bulk-export', bulkExportRouter);
app.use('/api/allergies', allergiesRouter);
app.use('/api', staticDataRouter);
app.use('/api/administer', administerRouter);

app.delete('/api/cache', (req, res) => {
  console.log('[API] DELETE /api/cache - Clearing all caches');
  
  // Clear allergy cache
  allergyCache.data = undefined;
  allergyCache.timestamp = undefined;
  
  // Clear export status cache
  Object.keys(exportStatus).forEach(key => delete exportStatus[key]);
  
  res.json({ 
    message: 'All caches cleared successfully',
    cleared: {
      allergyCache: true,
      exportStatusCache: true
    }
  });
});

export default app; 