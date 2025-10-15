import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

const schemaCreate = z.object({
  nome: z.string().trim().min(2),
  descricao: z.string().trim().optional().nullable(),
});
const schemaUpdate = z.object({
  nome: z.string().trim().min(2).optional(),
  descricao: z.string().trim().optional().nullable(),
});
// NEW: valida o :id como inteiro positivo
const schemaIdParam = z.object({ id: z.coerce.number().int().positive() });


router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('funcionarios_funcoes')
      .select('*')
      .orderBy('nome', 'asc');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = schemaIdParam.parse(req.params);
    const row = await db('funcionarios_funcoes').where({ id }).first();
    if (!row) return res.status(404).json({ error: 'Função não encontrada' });
    res.json(row);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const payload = parsed.data;

    const [row] = await db('funcionarios_funcoes')
      .insert({ nome: payload.nome, descricao: payload.descricao ?? null })
      .returning('*');

    res.status(201).json(row);
  } catch (err) {
    if (err?.code === '23505') { // unique constraint
      return res.status(409).json({ error: 'Já existe uma função com esse nome.' });
    }
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = schemaIdParam.parse(req.params);
    const parsed = schemaUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const [row] = await db('funcionarios_funcoes')
      .where({ id })
      .update({ ...patch, modificado_em: db.fn.now() })
      .returning('*');

    if (!row) return res.status(404).json({ error: 'Função não encontrada' });
    res.json(row);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma função com esse nome.' });
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = schemaIdParam.parse(req.params);

    // pré-check de uso
    const hasFuncionarios = await db.schema.hasTable('funcionarios');
    if (hasFuncionarios) {
      const inUse = await db('funcionarios').where('funcao_id', id).first(); // <-- id numérico
      if (inUse) {
        return res.status(409).json({
          error: 'Não é possível excluir: função está associada a funcionário(s).',
        });
      }
    }

    const del = await db('funcionarios_funcoes').where({ id }).del();
    if (!del) return res.status(404).json({ error: 'Função não encontrada' });
    return res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
