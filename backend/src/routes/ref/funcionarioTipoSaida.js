// src/routes/ref/funcionarioTiposSaida.js
import { Router } from 'express';
import { db } from '../../db.js'; // <- atenção: duas pastas acima + .js

const router = Router();

/**
 * GET /api/ref/funcionario-tipos-saida?ativos=true
 * Tabela esperada: public.funcionario_tipo_saida (id int, nome text, ativo bool)
 */
router.get('/', async (req, res, next) => {
  try {
    const onlyActive = String(req.query.ativos ?? '').toLowerCase() === 'true';
    const q = db('funcionario_tipo_saida').select('id', 'nome', 'ativo').orderBy('nome', 'asc');
    if (onlyActive) q.where({ ativo: true });
    const rows = await q;
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
