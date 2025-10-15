import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const schemaCreate = z.object({ nome: z.string().trim().min(2) });
const schemaUpdate = z.object({ nome: z.string().trim().min(2) }).partial();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('forma_pagamento').select('id','nome').orderBy('nome');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const row = await db('forma_pagamento').where({ id }).first();
    if (!row) return res.status(404).json({ error: 'Forma de pagamento não encontrada' });
    res.json(row);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const p = schemaCreate.parse(req.body);
    const [row] = await db('forma_pagamento').insert({ nome: p.nome }).returning('*');
    res.status(201).json(row);
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Já existe uma forma com esse nome.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const patch = schemaUpdate.parse(req.body);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    const [row] = await db('forma_pagamento').where({ id }).update(patch).returning('*');
    if (!row) return res.status(404).json({ error: 'Forma de pagamento não encontrada' });
    res.json(row);
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Já existe uma forma com esse nome.' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const del = await db('forma_pagamento').where({ id }).del();
    if (!del) return res.status(404).json({ error: 'Forma de pagamento não encontrada' });
    res.status(204).send();
  } catch (err) {
    if (err?.code === '23503') return res.status(409).json({ error: 'Registro em uso por outras tabelas.' });
    next(err);
  }
});

export default router;
