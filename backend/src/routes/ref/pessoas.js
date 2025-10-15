// backend/src/routes/ref/pessoas.js
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';

const router = Router();

// Nada de "as const" aqui — JS puro
const TIPOS = ['Fornecedor', 'Cliente', 'Funcionario'];
const TipoPessoa = z.enum(TIPOS);
const idParam = z.object({ id: z.coerce.number().int().positive() });

// Helper para decidir o nome da tabela (pessoa vs pessoas)
async function pessoaTable() {
  const hasSingular = await db.schema.hasTable('pessoa');
  if (hasSingular) return 'pessoa';
  const hasPlural = await db.schema.hasTable('pessoas');
  if (hasPlural) return 'pessoas';
  throw new Error('Tabela pessoa/pessoas não existe.');
}

const schemaCreate = z.object({
  tipo: TipoPessoa,
  ativo: z.coerce.boolean().optional(), // default true
});

const schemaUpdate = z.object({
  tipo: TipoPessoa.optional(),
  ativo: z.coerce.boolean().optional(),
});

// LISTAR
router.get('/', async (_req, res) => {
  try {
    const T = await pessoaTable();
    const rows = await db(T)
      .select('id', 'tipo', 'ativo')
      .whereIn('tipo', TIPOS)
      .orderBy('tipo', 'asc');
    res.json(rows);
  } catch (err) {
    console.error('GET /pessoas erro:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// OBTER
router.get('/:id', async (req, res) => {
  try {
    const { id } = idParam.parse(req.params);
    const T = await pessoaTable();
    const row = await db(T).select('id', 'tipo', 'ativo').where({ id }).first();
    if (!row || !TIPOS.includes(row.tipo)) {
      return res.status(404).json({ error: 'Tipo de pessoa não encontrado' });
    }
    res.json(row);
  } catch (err) {
    console.error('GET /pessoas/:id erro:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// CRIAR (idempotente por tipo)
router.post('/', async (req, res) => {
  try {
    const p = schemaCreate.parse(req.body);
    const T = await pessoaTable();

    const existing = await db(T).select('id', 'tipo', 'ativo').where({ tipo: p.tipo }).first();
    if (existing) return res.status(200).json(existing);

    const [row] = await db(T)
      .insert({ tipo: p.tipo, ativo: p.ativo ?? true })
      .returning(['id', 'tipo', 'ativo']);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /pessoas erro:', err);
    // conflito de UNIQUE(tipo)
    if (err?.code === '23505') return res.status(409).json({ error: 'Tipo já cadastrado.' });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ATUALIZAR
router.put('/:id', async (req, res) => {
  try {
    const { id } = idParam.parse(req.params);
    const patch = schemaUpdate.parse(req.body);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }
    const T = await pessoaTable();

    if (patch.tipo) {
      const dupe = await db(T).where({ tipo: patch.tipo }).andWhereNot({ id }).first();
      if (dupe) return res.status(409).json({ error: 'Já existe um registro para este tipo.' });
    }

    const [row] = await db(T)
      .where({ id })
      .update({ ...patch })
      .returning(['id', 'tipo', 'ativo']);

    if (!row || !TIPOS.includes(row.tipo)) {
      return res.status(404).json({ error: 'Tipo de pessoa não encontrado' });
    }
    res.json(row);
  } catch (err) {
    console.error('PUT /pessoas/:id erro:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
  try {
    const { id } = idParam.parse(req.params);
    const T = await pessoaTable();
    const del = await db(T).where({ id }).del();
    if (!del) return res.status(404).json({ error: 'Tipo de pessoa não encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /pessoas/:id erro:', err);
    if (err?.code === '23503') return res.status(409).json({ error: 'Registro em uso por outras tabelas.' });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
