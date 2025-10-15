// backend/src/routes/fornecedores.js
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const schemaCreate = z.object({
  nome: z.string().trim().min(2),
  documento: z.string().trim().optional().nullable()
    .transform(v => (v ? v.replace(/\D/g, '') : null))
    .refine(v => v === null || (v.length === 11 || v.length === 14), {
      message: 'Documento deve ser CPF (11) ou CNPJ (14) dígitos.'
    }),
  contato: z.string().trim().optional().nullable(),
  ativo: z.coerce.boolean().optional(),
});

const schemaUpdate = z.object({
  nome: z.string().trim().min(2).optional(),
  documento: z.string().trim().optional().nullable()
    .transform(v => (v ? v.replace(/\D/g, '') : null))
    .refine(v => v === undefined || v === null || (v.length === 11 || v.length === 14), {
      message: 'Documento deve ser CPF (11) ou CNPJ (14) dígitos.'
    }),
  contato: z.string().trim().optional().nullable(),
  ativo: z.coerce.boolean().optional(),
});

// LISTAR (suporta ?ativos=true para o select)
router.get('/', async (req, res, next) => {
  try {
    const onlyAtivos = String(req.query.ativos || '') === 'true';

    const q = db('fornecedores')
      .select('id','nome','documento','contato','ativo','criado_em','modificado_em')
      .orderBy('nome','asc');

    if (onlyAtivos) {
      const cols = await db('fornecedores').columnInfo();
      if (cols.ativo) q.where('ativo', true);
    }

    res.json(await q);
  } catch (err) {
    console.error('GET /fornecedores erro:', err);
    next(err);
  }
});

// OBTER
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const row = await db('fornecedores')
      .select('id','nome','documento','contato','ativo','criado_em','modificado_em')
      .where({ id }).first();
    if (!row) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(row);
  } catch (err) {
    console.error('GET /fornecedores/:id erro:', err);
    next(err);
  }
});

// CRIAR
router.post('/', async (req, res, next) => {
  try {
    const p = schemaCreate.parse(req.body);
    const [row] = await db('fornecedores')
      .insert({
        nome: p.nome,
        documento: p.documento ?? null,
        contato: p.contato ?? null,
        ativo: p.ativo ?? true,
      })
      .returning(['id','nome','documento','contato','ativo','criado_em','modificado_em']);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /fornecedores erro:', err);
    if (err?.code === '23505') return res.status(409).json({ error: 'Documento já cadastrado.' });
    next(err);
  }
});

// ATUALIZAR
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const patch = schemaUpdate.parse(req.body);
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    if (patch.documento != null) {
      const dupe = await db('fornecedores')
        .where({ documento: patch.documento })
        .andWhereNot({ id })
        .first('id');
      if (dupe) return res.status(409).json({ error: 'Documento já cadastrado.' });
    }

    const [row] = await db('fornecedores')
      .where({ id })
      .update({ ...patch, modificado_em: db.fn.now() })
      .returning(['id','nome','documento','contato','ativo','criado_em','modificado_em']);

    if (!row) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(row);
  } catch (err) {
    console.error('PUT /fornecedores/:id erro:', err);
    next(err);
  }
});

// EXCLUIR (bloqueia se houver vínculos em ccm_saida_fornecedor)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);

    const vinc = await db('ccm_saida_fornecedor').where({ fornecedor_id: id }).first('id');
    if (vinc) {
      return res.status(409).json({ error: 'Não é possível excluir: fornecedor está vinculado a saídas.' });
    }

    const del = await db('fornecedores').where({ id }).del();
    if (!del) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /fornecedores/:id erro:', err);
    if (err?.code === '23503') return res.status(409).json({ error: 'Registro em uso por outras tabelas.' });
    next(err);
  }
});

export default router;
