import { Router } from 'express';
import { db } from '../db.js';
import { z } from 'zod';

const router = Router();

const idParam = z.coerce.number().int().positive();
const hhmmRegex = /^(\d{2}):(\d{2})(?::\d{2})?$/; // HH:MM ou HH:MM:SS

const payloadSchema = z.object({
  caixa: z.string().trim().min(1),
  hora_inicio: z.string().regex(hhmmRegex, 'Formato inválido. Use HH:MM ou HH:MM:SS'),
  hora_fim: z.string().regex(hhmmRegex, 'Formato inválido. Use HH:MM ou HH:MM:SS').nullable().optional(),
  ativo: z.coerce.boolean().optional(),   // <- novo
}).refine(
  (p) => !p.hora_fim || p.hora_fim >= p.hora_inicio,
  { message: 'hora_fim não pode ser anterior a hora_inicio.', path: ['hora_fim'] }
);

/** LISTAR */
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('sessoes_caixa')
      .select('id', 'caixa', 'hora_inicio', 'hora_fim', 'ativo', 'criado_em', 'modificado_em')
      .orderBy([{ column: 'modificado_em', order: 'desc' }, { column: 'id', order: 'desc' }]);

    res.json(rows);
  } catch (err) { next(err); }
});

/** LER 1 por ID */
router.get('/:id', async (req, res, next) => {
  try {
    const parsed = idParam.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'ID inválido' });
    const id = parsed.data;

    const row = await db('sessoes_caixa')
      .select('id', 'caixa', 'hora_inicio', 'hora_fim', 'ativo', 'criado_em', 'modificado_em')
      .where({ id })
      .first();

    if (!row) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.json(row);
  } catch (err) { next(err); }
});

/** CRIAR */
router.post('/', async (req, res, next) => {
  try {
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const p = parsed.data;

    const [row] = await db('sessoes_caixa')
      .insert({
        caixa: p.caixa,
        hora_inicio: p.hora_inicio,
        hora_fim: p.hora_fim ?? null,
        ativo: p.ativo ?? true,                 // <- default true
      })
      .returning(['id', 'caixa', 'hora_inicio', 'hora_fim', 'ativo', 'criado_em', 'modificado_em']);

    res.status(201).json(row);
  } catch (err) { next(err); }
});

/** ATUALIZAR */
router.put('/:id', async (req, res, next) => {
  try {
    const idParsed = idParam.safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'ID inválido' });
    const id = idParsed.data;

    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const p = parsed.data;

    const exists = await db('sessoes_caixa').where({ id }).first('id');
    if (!exists) return res.status(404).json({ error: 'Sessão não encontrada' });

    const [row] = await db('sessoes_caixa')
      .where({ id })
      .update(
        {
          caixa: p.caixa,
          hora_inicio: p.hora_inicio,
          hora_fim: p.hora_fim ?? null,
          ativo: p.ativo ?? true,               // <- mantém coerência
          modificado_em: db.fn.now(),
        },
        ['id', 'caixa', 'hora_inicio', 'hora_fim', 'ativo', 'criado_em', 'modificado_em']
      );

    res.json(row);
  } catch (err) { next(err); }
});

/** EXCLUIR */
router.delete('/:id', async (req, res, next) => {
  try {
    const parsed = idParam.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'ID inválido' });
    const id = parsed.data;

    const del = await db('sessoes_caixa').where({ id }).del();
    if (del === 0) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
