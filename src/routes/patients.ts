import { Router } from 'express';
import axios, { AxiosResponse } from 'axios';
import { LOCAL_HAPI_SERVER_URL } from '../config';

const router = Router();

router.get('/', async (req, res) => {
  console.log(`[API] GET /api/patients count=${req.query.count || 100}`);
  try {
    const count = req.query.count || 100;
    const url = `${LOCAL_HAPI_SERVER_URL}/Patient?_count=${count}`;
    const response: AxiosResponse = await axios.get(url, { headers: req.headers });
    res.status(response.status).json(response.data);
  } catch (err: any) {
    console.error('[API ERROR] /api/patients:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

export default router; 