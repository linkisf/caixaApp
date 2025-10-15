// backend/src/routes/ref/contasDirecao.js
import { Router } from 'express';
import { db } from '../../db.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('conta_direcao').select('id','nome').orderBy('id','asc');
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
