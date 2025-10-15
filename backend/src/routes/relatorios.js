// backend/src/routes/relatorios.js
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

/**
 * GET /api/relatorios/dre?ano=2025
 * Retorna linhas derivadas (Receita Bruta, Impostos, Receita Líquida, Custos, Lucros, etc.)
 * em formato pivot JAN..DEZ..TOTAL (centavos).
 */
router.get('/dre', async (req, res, next) => {
  try {
    const schema = z.object({
      ano: z.coerce.number().int().min(2000).max(2100),
    });
    const { ano } = schema.parse(req.query);

    // Chama a função que retorna 12 linhas (1 por mês) com todos os campos derivados
    const rows = (await db.raw(`SELECT * FROM public.fn_dre_linhas_mensal(?)`, [ano])).rows;

    // Helper: monta uma linha "pivotada" por indicador
    const mkRow = (label, key, ordem) => {
      const get = (m) => Number(rows.find(r => r.mes === m)?.[key] || 0);
      const row = {
        classificacao: label,
        classificacao_ordem: ordem,
        jan: get(1), fev: get(2), mar: get(3), abr: get(4), mai: get(5), jun: get(6),
        jul: get(7), ago: get(8), set: get(9), out: get(10), nov: get(11), dez: get(12),
      };
      const total = row.jan + row.fev + row.mar + row.abr + row.mai + row.jun +
                    row.jul + row.ago + row.set + row.out + row.nov + row.dez;
      return { ...row, total };
    };

    const linhas = [
      mkRow('Receita Operacional Bruta',  'receita_bruta_cent',       10),
      mkRow('Impostos e Devoluções',     'impostos_dev_cent',         20),
      mkRow('Receita Operacional Líquida','receita_liquida_cent',     30),
      mkRow('Custos',                    'custos_cent',               40),
      mkRow('Lucro (Prejuízo) Bruto',    'lucro_bruto_cent',          50),
      mkRow('Despesas Operacionais',     'despesas_oper_cent',        60),
      mkRow('Lucro (Prejuízo) Operacional','lucro_oper_cent',         70),
      mkRow('Resultado Financeiro',      'resultado_fin_cent',        80),
      mkRow('Lucro (Prejuízo) Líquido',  'lucro_liquido_cent',        90),
    ];

    res.json({ ano, linhas });
  } catch (err) {
    console.error('[relatorios/dre] erro SQL:', err);
    next(err);
  }
});

/**
 * GET /api/relatorios/balanco?data=2025-12-31
 * Retorna totais por grupo (ATIVO/PASSIVO/PL/OUTROS) e detalhamento por conta.
 */
router.get('/balanco', async (req, res, next) => {
  try {
    const schema = z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
    const { data } = schema.parse(req.query);

    const grupos = (await db.raw(`SELECT * FROM public.fn_balanco(?::date)`, [data])).rows;
    const contas = (await db.raw(`SELECT * FROM public.fn_saldo_conta_ate(?::date) ORDER BY tipo_conta_nome, conta_nome`, [data])).rows;

    res.json({ data, grupos, contas });
  } catch (err) {
    console.error('[relatorios/balanco] erro:', err);
    next(err);
  }
});

export default router;
