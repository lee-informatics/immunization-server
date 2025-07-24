import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import patientsRouter from './routes/patients';
import bulkExportRouter from './routes/bulkExport';
import allergiesRouter from './routes/allergies';
import staticDataRouter from './routes/staticData';

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use('/api/patients', patientsRouter);
app.use('/api/patient-export', bulkExportRouter);
app.use('/api/bulk-export', bulkExportRouter);
app.use('/api/allergies', allergiesRouter);
app.use('/api', staticDataRouter);

export default app; 