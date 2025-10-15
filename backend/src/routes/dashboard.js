// backend/src/routes/dashboard.js
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

/** valida query ?de=YYYY-MM-DD&ate=YYYY-MM-DD */
const qSchema = z.object({
  de:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/', async (req, res, next) => {
  try {
    const { success, data, error } = qSchema.safeParse(req.query);
    if (!success) return res.status(400).json({ error: 'Parâmetros inválidos', issues: error.issues });

    // período padrão: últimos 30 dias
    const hoje = todayISO();
    const padraoAte = hoje;
    const padraoDe  = new Date(Date.now() - 29*24*60*60*1000).toISOString().slice(0, 10);

    const de  = data.de  ?? padraoDe;
    const ate = data.ate ?? padraoAte;

    const isOperacional = (qb) => qb.whereNotNull('m.conta_id'); // exclui transferências

    // ========= Saldos =========
    const [{ saldo_total_centavos }] = await db('contas_corrente')
      .sum({ saldo_total_centavos: 'saldo_atual_centavos' });

    const saldosPorConta = await db('contas_corrente')
      .select('id','nome','saldo_atual_centavos','ativa')
      .orderBy('nome','asc');

    const negativos = saldosPorConta.filter(c => c.saldo_atual_centavos < 0);
    const inativasComSaldo = saldosPorConta.filter(c => c.ativa === false && c.saldo_atual_centavos !== 0);

    // ========= Totais do dia (hoje) =========
    const [totDia] = await db('contas_corrente_movimento as m')
      .modify(isOperacional)
      .where('m.data', hoje)
      .sum({
        entradas_cent: db.raw("CASE WHEN m.direcao = 'recebido' THEN m.valor_centavos ELSE 0 END"),
        saidas_cent:   db.raw("CASE WHEN m.direcao = 'pago'     THEN m.valor_centavos ELSE 0 END"),
      });

    // ========= Totais do mês corrente (baseado em 'ate') =========
    const base = new Date(ate + 'T00:00:00');
    const mesInicio = new Date(base.getFullYear(), base.getMonth(), 1).toISOString().slice(0,10);
    const proxMes   = new Date(base.getFullYear(), base.getMonth()+1, 1).toISOString().slice(0,10);

    const [totMes] = await db('contas_corrente_movimento as m')
      .modify(isOperacional)
      .whereBetween('m.data', [mesInicio, new Date(new Date(proxMes).getTime() - 86400000).toISOString().slice(0,10)])
      .sum({
        entradas_cent: db.raw("CASE WHEN m.direcao = 'recebido' THEN m.valor_centavos ELSE 0 END"),
        saidas_cent:   db.raw("CASE WHEN m.direcao = 'pago'     THEN m.valor_centavos ELSE 0 END"),
      });

    // ========= Série diária contínua (de..ate) =========
    // Usa generate_series para garantir todos os dias com zero quando não houver movimento
    const serieRaw = await db.raw(`
      WITH dias AS (
        SELECT generate_series(?::date, ?::date, interval '1 day')::date AS data
      ),
      mov AS (
        SELECT m.data::date AS data,
               SUM(CASE WHEN m.direcao='recebido' THEN m.valor_centavos ELSE 0 END) AS entradas_cent,
               SUM(CASE WHEN m.direcao='pago'     THEN m.valor_centavos ELSE 0 END) AS saidas_cent
        FROM contas_corrente_movimento m
        WHERE m.conta_id IS NOT NULL
          AND m.data BETWEEN ?::date AND ?::date
        GROUP BY m.data::date
      )
      SELECT d.data,
             COALESCE(m.entradas_cent, 0) AS entradas_cent,
             COALESCE(m.saidas_cent,   0) AS saidas_cent
      FROM dias d
      LEFT JOIN mov m ON m.data = d.data
      ORDER BY d.data ASC
    `, [de, ate, de, ate]);

    const serieDiaria = (serieRaw.rows || []).map(r => ({
      data: r.data.toISOString ? r.data.toISOString().slice(0,10) : String(r.data).slice(0,10),
      entradas_cent: Number(r.entradas_cent ?? 0),
      saidas_cent:   Number(r.saidas_cent ?? 0),
    }));

    // ========= Totais do período (de..ate) =========
    const [totPeriodo] = await db('contas_corrente_movimento as m')
      .modify(isOperacional)
      .whereBetween('m.data', [de, ate])
      .sum({
        entradas_cent: db.raw("CASE WHEN m.direcao = 'recebido' THEN m.valor_centavos ELSE 0 END"),
        saidas_cent:   db.raw("CASE WHEN m.direcao = 'pago'     THEN m.valor_centavos ELSE 0 END"),
      });

    // ========= DRE do período =========
    const dre = await db('contas_corrente_movimento as m')
      .join('conta as c', 'c.id', 'm.conta_id')
      .leftJoin('tipo_conta as tc', 'tc.id', 'c.tipo_conta_id')
      .leftJoin('classificacao_dre as cd', 'cd.id', 'c.classificacao_dre_id')
      .whereBetween('m.data', [de, ate])
      .select(
        'tc.nome as tipo_conta',
        'cd.nome as classificacao_dre',
        db.raw(`
          SUM(
            CASE
              WHEN m.direcao='recebido' THEN  m.valor_centavos
              WHEN m.direcao='pago'     THEN -m.valor_centavos
              ELSE 0
            END
          ) AS total_cent
        `)
      )
      .groupBy('tc.nome','cd.nome')
      .orderBy(['tc.nome','cd.nome']);

    // ========= Por forma de pagamento =========
    const porFormaPgto = await db('contas_corrente_movimento as m')
      .join('forma_pagamento as fp', 'fp.id', 'm.forma_pagamento_id')
      .modify(isOperacional)
      .whereBetween('m.data', [de, ate])
      .select(
        'fp.nome',
        db.raw("SUM(CASE WHEN m.direcao='recebido' THEN m.valor_centavos ELSE 0 END) AS entradas_cent"),
        db.raw("SUM(CASE WHEN m.direcao='pago'     THEN m.valor_centavos ELSE 0 END) AS saidas_cent")
      )
      .groupBy('fp.nome')
      .orderBy('fp.nome');

    // ========= Por conta-corrente =========
    const porContaCorrente = await db('contas_corrente_movimento as m')
      .join('contas_corrente as cc', 'cc.id', 'm.conta_corrente_id')
      .modify(isOperacional)
      .whereBetween('m.data', [de, ate])
      .select(
        'cc.nome',
        db.raw("SUM(CASE WHEN m.direcao='recebido' THEN m.valor_centavos ELSE 0 END) AS entradas_cent"),
        db.raw("SUM(CASE WHEN m.direcao='pago'     THEN m.valor_centavos ELSE 0 END) AS saidas_cent")
      )
      .groupBy('cc.nome')
      .orderBy('cc.nome');

    // ========= Transferências recentes =========
    const transferenciasRecentes = await db('transferencias as t')
      .join('contas_corrente as co','co.id','t.origem_conta_corrente_id')
      .join('contas_corrente as cd','cd.id','t.destino_conta_corrente_id')
      .select('t.id','t.data','t.valor_centavos','t.descricao','co.nome as origem_nome','cd.nome as destino_nome')
      .orderBy([{ column: 't.data', order: 'desc' }, { column: 't.criado_em', order: 'desc' }])
      .limit(10);

    res.json({
      periodo: { de, ate },
      saldos: {
        total_centavos: Number(saldo_total_centavos ?? 0),
        por_conta: saldosPorConta,
        alertas: { negativos, inativas_com_saldo: inativasComSaldo },
      },
      hoje: {
        data: hoje,
        entradas_cent: Number(totDia?.entradas_cent ?? 0),
        saidas_cent:   Number(totDia?.saidas_cent ?? 0),
        net_cent:      Number(totDia?.entradas_cent ?? 0) - Number(totDia?.saidas_cent ?? 0),
      },
      mes_atual: {
        inicio: mesInicio,
        entradas_cent: Number(totMes?.entradas_cent ?? 0),
        saidas_cent:   Number(totMes?.saidas_cent ?? 0),
        net_cent:      Number(totMes?.entradas_cent ?? 0) - Number(totMes?.saidas_cent ?? 0),
      },
      serie_diaria: serieDiaria,
      dre: dre.map(r => ({
        tipo_conta: r.tipo_conta ?? '—',
        classificacao_dre: r.classificacao_dre ?? '—',
        total_cent: Number(r.total_cent ?? 0),
      })),
      formas_pagamento: porFormaPgto.map(r => ({
        nome: r.nome,
        entradas_cent: Number(r.entradas_cent ?? 0),
        saidas_cent:   Number(r.saidas_cent ?? 0),
      })),
      por_conta_corrente: porContaCorrente.map(r => ({
        nome: r.nome,
        entradas_cent: Number(r.entradas_cent ?? 0),
        saidas_cent:   Number(r.saidas_cent ?? 0),
      })),
      transferencias_recentes: transferenciasRecentes,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
