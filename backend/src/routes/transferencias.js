// backend/src/routes/transferencias.js
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

// Controle de fallback: por padrão usa TRIGGER do DB
const USE_DB_TRANSFER_TRIGGER = process.env.USE_DB_TRANSFER_TRIGGER
  ? String(process.env.USE_DB_TRANSFER_TRIGGER).toLowerCase() !== 'false'
  : true;

const schemaCreate = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  origem_conta_corrente_id: z.string().uuid(),
  destino_conta_corrente_id: z.string().uuid(),
  valor_centavos: z.coerce.number().int().positive(),
  descricao: z.string().trim().nullable().optional(),
});

const querySchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// POST /api/transferencias  -> cria o cabeçalho (o trigger cria os 2 lançamentos)
// Se USE_DB_TRANSFER_TRIGGER=false: cria manualmente os 2 lançamentos na mesma transação
router.post('/', async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const p = parsed.data;

    if (p.origem_conta_corrente_id === p.destino_conta_corrente_id) {
      return res.status(400).json({ error: 'Origem e destino devem ser diferentes.' });
    }

    // valida FKs (e ativa)
    const origem = await db('contas_corrente').where({ id: p.origem_conta_corrente_id, ativa: true }).first('id');
    const destino = await db('contas_corrente').where({ id: p.destino_conta_corrente_id, ativa: true }).first('id');
    if (!origem) return res.status(400).json({ error: 'Conta de origem inválida/inativa.' });
    if (!destino) return res.status(400).json({ error: 'Conta de destino inválida/inativa.' });

    const row = await db.transaction(async (trx) => {
      // 1) cria a transferência (cabeçalho)
      const [created] = await trx('transferencias')
        .insert({
          data: p.data,
          origem_conta_corrente_id: p.origem_conta_corrente_id,
          destino_conta_corrente_id: p.destino_conta_corrente_id,
          valor_centavos: p.valor_centavos,
          descricao: p.descricao ?? null,
        })
        .returning('*');

      // 2) Fallback: se não houver trigger no DB, cria manualmente os 2 movimentos
      if (!USE_DB_TRANSFER_TRIGGER) {
        await trx('contas_corrente_movimento').insert([
          {
            data: created.data,
            conta_id: null,
            conta_corrente_id: created.origem_conta_corrente_id,
            valor_centavos: created.valor_centavos,
            direcao: 'pago', // SAÍDA na origem
            forma_pagamento_id: null,
            descricao: created.descricao ?? 'Transferência de saída',
            transferencia_id: created.id,
          },
          {
            data: created.data,
            conta_id: null,
            conta_corrente_id: created.destino_conta_corrente_id,
            valor_centavos: created.valor_centavos,
            direcao: 'recebido', // ENTRADA no destino
            forma_pagamento_id: null,
            descricao: created.descricao ?? 'Transferência de entrada',
            transferencia_id: created.id,
          },
        ]);
      }

      // 3) retorna “enriquecido” com nomes
      const out = await trx('transferencias as t')
        .join('contas_corrente as co', 'co.id', 't.origem_conta_corrente_id')
        .join('contas_corrente as cd', 'cd.id', 't.destino_conta_corrente_id')
        .select(
          't.id',
          't.data',
          't.valor_centavos',
          't.descricao',
          'co.nome as origem_nome',
          'cd.nome as destino_nome'
        )
        .where('t.id', created.id)
        .first();

      return out;
    });

    res.status(201).json(row);
  } catch (err) {
    // Log opcional mais verboso:
    console.error('[transferencias POST] erro:', err);
    next(err);
  }
});

// GET /api/transferencias?de&ate&limit&offset  -> lista 1 linha por transferência
router.get('/', async (req, res, next) => {
  try {
    const qp = querySchema.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: 'Parâmetros inválidos', issues: qp.error.issues });
    const { de, ate, limit, offset } = qp.data;

    const q = db('transferencias as t')
      .join('contas_corrente as co', 'co.id', 't.origem_conta_corrente_id')
      .join('contas_corrente as cd', 'cd.id', 't.destino_conta_corrente_id')
      .select(
        't.id',
        't.data',
        't.valor_centavos',
        't.descricao',
        'co.nome as origem_nome',
        'cd.nome as destino_nome'
      );

    if (de) q.andWhere('t.data', '>=', de);
    if (ate) q.andWhere('t.data', '<=', ate);

    const rows = await q
      .orderBy([{ column: 't.data', order: 'desc' }, { column: 't.criado_em', order: 'desc' }])
      .limit(limit)
      .offset(offset);

    res.json(rows);
  } catch (err) {
    console.error('[transferencias GET] erro:', err);
    next(err);
  }
});

// DELETE /api/transferencias/:id  -> apaga o cabeçalho; ON DELETE CASCADE remove os dois lançamentos
router.delete('/:id', async (req, res, next) => {
  try {
    const del = await db('transferencias').where({ id: req.params.id }).del();
    if (!del) return res.status(404).json({ error: 'Transferência não encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error('[transferencias DELETE] erro:', err);
    next(err);
  }
});

export default router;
