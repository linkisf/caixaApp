// backend/src/routes/saidas.js
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

/* =========================================================
 * Helpers
 * ======================================================= */

/**
 * Retorna a lista de labels do enum mov_direcao (ex.: ['entrada','pago'] ou ['entrada','saida'])
 */
async function fetchMovDirecaoLabels(trxOrDb = db) {
  try {
    const rows = await trxOrDb
      .select({ enumlabel: db.raw("e.enumlabel") })
      .from({ t: db.raw("pg_type") })
      .joinRaw("JOIN pg_enum e ON t.oid = e.enumtypid")
      .where("t.typname", "mov_direcao")
      .orderBy("e.enumsortorder", "asc");

    return rows.map((r) => String(r.enumlabel));
  } catch (_e) {
    // Fallback seguro se não conseguir consultar o catálogo
    return ["entrada", "pago"];
  }
}

/**
 * Decide qual label do enum representa SAÍDA nesta base:
 * - preferimos 'saida' se existir
 * - senão 'pago' (bases antigas)
 * - se nenhum existir, usamos o primeiro que não seja 'entrada'
 */
async function pickSaidaLabel(trxOrDb = db) {
  const labels = await fetchMovDirecaoLabels(trxOrDb);
  if (labels.includes("saida")) return "saida";
  if (labels.includes("pago")) return "pago";
  const fallback = labels.find((l) => l !== "entrada") || labels[0] || "pago";
  return fallback;
}

/**
 * Quando a tabela ref_contas_direcao existir, retorna "Saida"/"Entrada"/"Neutra".
 * Caso a tabela não exista, retorna null (e seguimos sem essa checagem).
 */
async function getDirecaoConta(contaId) {
  try {
    const row = await db("conta as c")
      .leftJoin({ d: "ref_contas_direcao" }, "d.id", "c.conta_direcao_id")
      .where("c.id", contaId)
      .first({ direcao_nome: "d.nome" });
    return row?.direcao_nome ?? null;
  } catch (e) {
    if (e && e.code === "42P01") return null; // tabela ref não existe
    throw e;
  }
}

/* =========================================================
 * Schemas
 * ======================================================= */

const querySchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

const schemaCreate = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  conta_id: z.coerce.number().int().positive(),
  conta_corrente_id: z.string().uuid(),
  valor_centavos: z.coerce.number().int().positive(),
  direcao: z.enum(["pago"]).optional(), // ignorado; decidimos a direção conforme o enum
  forma_pagamento_id: z.coerce.number().int().positive(),
  descricao: z.string().trim().nullable().optional(),

  destino_tipo: z.enum(["funcionario", "fornecedor", "nenhum"]).default("nenhum"),
  destino_id: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  funcionario_tipo_saida_id: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
});

/* =========================================================
 * GET /api/saidas
 * - Busca movimentos com direcao 'pago' e/ou 'saida' (compat)
 * ======================================================= */
router.get("/", async (req, res, next) => {
  try {
    const qp = querySchema.safeParse(req.query);
    let { de, ate } = qp.success ? qp.data : {};
    if (de && ate && de > ate) { const t = de; de = ate; ate = t; }

    const labels = await fetchMovDirecaoLabels();
    const saidaLike = labels.includes("saida") ? ["saida"] : [];
    const pagoLike  = labels.includes("pago")  ? ["pago"]  : [];
    const direcoesSaida = [...new Set([...saidaLike, ...pagoLike])];
    const filtroDirecoes = direcoesSaida.length ? direcoesSaida : ["pago"];

    const q = db("contas_corrente_movimento as m")
      .select(
        "m.id","m.data","m.valor_centavos","m.direcao","m.descricao","m.criado_em",
        "m.conta_id",
        db.raw("c.codigo as conta_codigo"),
        db.raw("c.nome as conta_nome"),
        "m.conta_corrente_id",
        db.raw("cc.nome as conta_corrente_nome"),
        "m.forma_pagamento_id",
        db.raw("fp.nome as forma_pagamento_nome")
      )
      .leftJoin({ c: "conta" }, "c.id", "m.conta_id")
      .leftJoin({ cc: "contas_corrente" }, "cc.id", "m.conta_corrente_id")
      .leftJoin({ fp: "forma_pagamento" }, "fp.id", "m.forma_pagamento_id")
      .whereNotNull("m.conta_id")
      .whereIn("m.direcao", filtroDirecoes);

    if (de) q.andWhere("m.data", ">=", de);
    if (ate) q.andWhere("m.data", "<=", ate);

    const rows = await q.orderBy([
      { column: "m.data", order: "desc" },
      { column: "m.criado_em", order: "desc" },
    ]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* =========================================================
 * GET /api/saidas/funcionarios
 * - Lista saídas vinculadas a funcionários (com tipo de saída)
 * ======================================================= */
router.get("/funcionarios", async (req, res, next) => {
  try {
    const qp = querySchema.safeParse(req.query);
    let { de, ate } = qp.success ? qp.data : {};
    if (de && ate && de > ate) { const t = de; de = ate; ate = t; }

    const labels = await fetchMovDirecaoLabels();
    const saidaLike = labels.includes("saida") ? ["saida"] : [];
    const pagoLike  = labels.includes("pago")  ? ["pago"]  : [];
    const direcoesSaida = [...new Set([...saidaLike, ...pagoLike])];
    const filtroDirecoes = direcoesSaida.length ? direcoesSaida : ["pago"];

    const q = db("contas_corrente_movimento as m")
      .innerJoin({ cf: "ccm_saida_funcionario" }, "cf.movimento_id", "m.id")
      .leftJoin({ f: "funcionarios" }, "f.id", "cf.funcionario_id")
      .leftJoin({ ts: "funcionario_tipo_saida" }, "ts.id", "cf.tipo_saida_id")
      .leftJoin({ c: "conta" }, "c.id", "m.conta_id")
      .leftJoin({ cc: "contas_corrente" }, "cc.id", "m.conta_corrente_id")
      .leftJoin({ fp: "forma_pagamento" }, "fp.id", "m.forma_pagamento_id")
      .whereNotNull("m.conta_id")
      .whereIn("m.direcao", filtroDirecoes)
      .select(
        "m.id","m.data","m.valor_centavos","m.direcao","m.descricao","m.criado_em",
        "m.conta_id",
        db.raw("c.codigo as conta_codigo"),
        db.raw("c.nome as conta_nome"),
        "m.conta_corrente_id",
        db.raw("cc.nome as conta_corrente_nome"),
        "m.forma_pagamento_id",
        db.raw("fp.nome as forma_pagamento_nome"),
        db.raw("f.nome as destino_nome"),
        db.raw("ts.nome as tipo_saida_nome")
      );

    if (de) q.andWhere("m.data", ">=", de);
    if (ate) q.andWhere("m.data", "<=", ate);

    const rows = await q.orderBy([
      { column: "m.data", order: "desc" },
      { column: "m.criado_em", order: "desc" },
    ]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* =========================================================
 * GET /api/saidas/fornecedores
 * - Lista saídas vinculadas a fornecedores
 * ======================================================= */
router.get("/fornecedores", async (req, res, next) => {
  try {
    const qp = querySchema.safeParse(req.query);
    let { de, ate } = qp.success ? qp.data : {};
    if (de && ate && de > ate) { const t = de; de = ate; ate = t; }

    const labels = await fetchMovDirecaoLabels();
    const saidaLike = labels.includes("saida") ? ["saida"] : [];
    const pagoLike  = labels.includes("pago")  ? ["pago"]  : [];
    const direcoesSaida = [...new Set([...saidaLike, ...pagoLike])];
    const filtroDirecoes = direcoesSaida.length ? direcoesSaida : ["pago"];

    const q = db("contas_corrente_movimento as m")
      .innerJoin({ cf: "ccm_saida_fornecedor" }, "cf.movimento_id", "m.id")
      .leftJoin({ forn: "fornecedores" }, "forn.id", "cf.fornecedor_id")
      .leftJoin({ c: "conta" }, "c.id", "m.conta_id")
      .leftJoin({ cc: "contas_corrente" }, "cc.id", "m.conta_corrente_id")
      .leftJoin({ fp: "forma_pagamento" }, "fp.id", "m.forma_pagamento_id")
      .whereNotNull("m.conta_id")
      .whereIn("m.direcao", filtroDirecoes)
      .select(
        "m.id","m.data","m.valor_centavos","m.direcao","m.descricao","m.criado_em",
        "m.conta_id",
        db.raw("c.codigo as conta_codigo"),
        db.raw("c.nome as conta_nome"),
        "m.conta_corrente_id",
        db.raw("cc.nome as conta_corrente_nome"),
        "m.forma_pagamento_id",
        db.raw("fp.nome as forma_pagamento_nome"),
        db.raw("forn.nome as destino_nome")
      );

    if (de) q.andWhere("m.data", ">=", de);
    if (ate) q.andWhere("m.data", "<=", ate);

    const rows = await q.orderBy([
      { column: "m.data", order: "desc" },
      { column: "m.criado_em", order: "desc" },
    ]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* =========================================================
 * POST /api/saidas
 * - Insere com o label correto para SAÍDA no enum
 * - Garante a direção antes de vincular funcionário/fornecedor
 * ======================================================= */
router.post("/", async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", issues: parsed.error.issues });
    }
    const p = parsed.data;

    // Conta ativa
    const conta = await db("conta").where({ id: p.conta_id, ativa: true }).first("id", "conta_direcao_id");
    if (!conta) return res.status(400).json({ error: "conta_id inválido ou inativa" });

    // Direção da conta (se a tabela de referência existir)
    const direcaoNome = await getDirecaoConta(p.conta_id); // "Saida" | "Entrada" | "Neutra" | null
    if (direcaoNome && !["Saida", "Neutra"].includes(String(direcaoNome))) {
      return res.status(400).json({
        error: "A conta selecionada é de ENTRADA. Para registrar uma saída, escolha uma conta de Saída ou Neutra.",
      });
    }

    // Conta-corrente ativa
    const okCC = await db("contas_corrente").where({ id: p.conta_corrente_id, ativa: true }).first("id");
    if (!okCC) return res.status(400).json({ error: "conta_corrente_id inválido ou inativa" });

    // Forma de pagamento
    const okFP = await db("forma_pagamento").where({ id: p.forma_pagamento_id }).first("id");
    if (!okFP) return res.status(400).json({ error: "forma_pagamento_id inválido" });

    // Destino
    if (p.destino_tipo !== "nenhum" && !p.destino_id) {
      return res.status(400).json({ error: "destino_id é obrigatório quando destino_tipo não é 'nenhum'" });
    }

    // Funcionário: exige tipo de saída
    if (p.destino_tipo === "funcionario") {
      if (!p.funcionario_tipo_saida_id) {
        return res.status(400).json({ error: "funcionario_tipo_saida_id é obrigatório quando destino_tipo = 'funcionario'" });
      }
      const okTipo = await db("funcionario_tipo_saida")
        .where({ id: p.funcionario_tipo_saida_id, ativo: true })
        .first("id");
      if (!okTipo) return res.status(400).json({ error: "funcionario_tipo_saida_id inválido" });
    }

    const mov = await db.transaction(async (trx) => {
      const saidaLabel = await pickSaidaLabel(trx); // 'saida' OU 'pago' (ou outro fallback)

      // Insere com cast explícito para o enum
      const [created] = await trx("contas_corrente_movimento")
        .insert({
          data: p.data,
          conta_id: p.conta_id,
          conta_corrente_id: p.conta_corrente_id,
          valor_centavos: p.valor_centavos,
          direcao: trx.raw("?::mov_direcao", [saidaLabel]),
          forma_pagamento_id: p.forma_pagamento_id,
          descricao: p.descricao ?? null,
        })
        .returning("*");

      // Confere direção persistida; se necessário, força update
      const check = await trx("contas_corrente_movimento").where({ id: created.id }).first("direcao");
      const finalDir = String(check?.direcao ?? "");
      if (finalDir !== saidaLabel) {
        await trx("contas_corrente_movimento")
          .where({ id: created.id })
          .update({ direcao: trx.raw("?::mov_direcao", [saidaLabel]) });
      }

      // Vincular destino
      if (p.destino_tipo === "funcionario") {
        const fx = await trx("funcionarios").where({ id: p.destino_id }).first("id");
        if (!fx) throw Object.assign(new Error("funcionario não encontrado"), { code: "VAL001" });

        await trx("ccm_saida_funcionario").insert({
          movimento_id: created.id,
          funcionario_id: p.destino_id,
          tipo_saida_id: p.funcionario_tipo_saida_id,
        });
      } else if (p.destino_tipo === "fornecedor") {
        const fx = await trx("fornecedores").where({ id: p.destino_id }).first("id");
        if (!fx) throw Object.assign(new Error("fornecedor não encontrado"), { code: "VAL002" });

        await trx("ccm_saida_fornecedor").insert({
          movimento_id: created.id,
          fornecedor_id: p.destino_id,
        });
      }

      return created;
    });

    res.status(201).json(mov);
  } catch (err) {
    const msg = String(err?.message || "");

    if (err?.code === "VAL001") return res.status(400).json({ error: "funcionario_id inválido" });
    if (err?.code === "VAL002") return res.status(400).json({ error: "fornecedor_id inválido" });

    // Erros de trigger (RAISE EXCEPTION -> P0001) retornam 400 com a mensagem original
    if (err && err.code === "P0001") {
      return res.status(400).json({ error: msg || "Regra de negócio do banco não atendida" });
    }

    next(err);
  }
});

/* =========================================================
 * DELETE /api/saidas/:id
 * - Permite excluir tanto 'pago' quanto 'saida'
 * ======================================================= */
router.delete("/:id", async (req, res, next) => {
  try {
    const labels = await fetchMovDirecaoLabels();
    const saidaLike = labels.includes("saida") ? ["saida"] : [];
    const pagoLike  = labels.includes("pago")  ? ["pago"]  : [];
    const direcoesSaida = [...new Set([...saidaLike, ...pagoLike])];
    const filtroDirecoes = direcoesSaida.length ? direcoesSaida : ["pago"];

    const del = await db("contas_corrente_movimento")
      .where({ id: req.params.id })
      .whereIn("direcao", filtroDirecoes)
      .del()
      .returning("id");

    if (!del?.length) return res.status(404).json({ error: "Saída não encontrada" });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
