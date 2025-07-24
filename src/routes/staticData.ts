import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const dataDir = path.resolve(__dirname, '../data');

router.get('/active-vaccines', (req: Request, res: Response) => {
  const filePath = path.join(dataDir, 'active_vaccines.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('[API ERROR] /api/active-vaccines:', err.message);
      return res.status(500).json({ error: 'Failed to read active_vaccines.json' });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).json({ error: 'Failed to parse active_vaccines.json' });
    }
  });
});

router.get('/medications', (req: Request, res: Response) => {
  const filePath = path.join(dataDir, 'medications.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('[API ERROR] /api/medications:', err.message);
      return res.status(500).json({ error: 'Failed to read medications.json' });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).json({ error: 'Failed to parse medications.json' });
    }
  });
});

router.get('/practitioners', (req: Request, res: Response) => {
  const filePath = path.join(dataDir, 'practitioners.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('[API ERROR] /api/practitioners:', err.message);
      return res.status(500).json({ error: 'Failed to read practitioners.json' });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).json({ error: 'Failed to parse practitioners.json' });
    }
  });
});

export default router; 