// backend/src/routes/contasAPagar.js
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

const DESTINO_ID_FUNC = 3;
const DESTINO_ID_FORN = 4;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  de: isoDate.optional(),
  ate: isoDate.optional(),
  status: z.enum(["aberto", "pago", "atrasado", "cancelado", "todos"]).optional().default("aberto"),
});

const pagarBody = z.object({
  data_pagamento: isoDate.default(new Date().toISOString().slice(0, 10)),
  conta_corrente_id: z.string().uuid(),
  forma_pagamento_id: z.coerce.number().int().positive(),
  descricao_mov: z.string().trim().optional().nullable(),
  funcionario_tipo_saida_id: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
});

// 🔧 criarBody agora aceita (a) destino_tipo_id ou (b) destino_tipo ("funcionario"/"fornecedor"),
// e deixa o destino totalmente opcional (ambos podem faltar).
const criarBody = z.object({
  data_emissao: isoDate,
  data_vencimento: isoDate.optional().nullable(),
  // destino opcional:
  destino_tipo_id: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  destino_tipo: z.enum(["funcionario", "fornecedor"]).optional(),
  destino_id: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  valor_centavos: z.coerce.number().int().positive(),
  conta_id: z.coerce.number().int().positive(),
  forma_pagamento_id: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  descricao: z.string().trim().optional().nullable(),
})
.refine((b) => {
  // se informar qualquer tipo, precisa informar destino_id; caso contrário, ambos podem faltar
  if (b.destino_tipo_id != null || b.destino_tipo != null) return b.destino_id != null;
  return true;
}, { message: "destino_id é obrigatório quando destino_tipo ou destino_tipo_id for informado", path: ["destino_id"] });

function isMissingTableOrColumn(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

async function getDomIds() {
  try {
    const status = await db("contas_a_pagar_status")
      .select("id", db.raw("LOWER(codigo) as codigo"), db.raw("LOWER(nome) as nome"));
    const destino = await db("contas_a_pagar_destino_tipo")
      .select("id", db.raw("LOWER(codigo) as codigo"), db.raw("LOWER(nome) as nome"), "ativo");

    const statusByCode = {};
    for (const s of status) {
      if (s.codigo) statusByCode[s.codigo] = s.id;
      if (s.nome)   statusByCode[s.nome]   = s.id;
    }

    const destinoByCode = {};
    for (const d of destino) {
      if (d.codigo) destinoByCode[d.codigo] = d.id;
      if (d.nome)   destinoByCode[d.nome]   = d.id;
    }

    return { statusByCode, destinoByCode, destinoRows: destino };
  } catch (err) {
    if (isMissingTableOrColumn(err)) return { statusByCode: {}, destinoByCode: {}, destinoRows: [] };
    throw err;
  }
}

async function pickSaidaLabel(trxOrDb = db) {
  try {
    const rows = await trxOrDb
      .select({ enumlabel: db.raw("e.enumlabel") })
      .from({ t: db.raw("pg_type") })
      .joinRaw("JOIN pg_enum e ON t.oid = e.enumtypid")
      .where("t.typname", "mov_direcao")
      .orderBy("e.enumsortorder", "asc");

    const labels = rows.map((r) => String(r.enumlabel));
    if (labels.includes("saida")) return "saida";
    if (labels.includes("pago"))  return "pago";
    return labels.find((l) => l !== "entrada") || "pago";
  } catch {
    return "pago";
  }
}

function destinoTipoToFrontend(destino_tipo_id, rawCodigo) {
  if (destino_tipo_id === DESTINO_ID_FUNC) return "funcionario";
  if (destino_tipo_id === DESTINO_ID_FORN) return "fornecedor";
  return String(rawCodigo || "").toLowerCase();
}

/* =========================
 * GET /api/contas-a-pagar/destinos-tipo
 * Lista tipos diretamente da tabela
 * ======================= */
router.get("/destinos-tipo", async (req, res) => {
  try {
    const ativos = String(req.query.ativos ?? "").toLowerCase() === "true";
    const q = db("contas_a_pagar_destino_tipo")
      .select("id", "codigo", "nome", "ativo")
      .modify((qb) => { if (ativos) qb.where({ ativo: true }); })
      .orderBy("nome", "asc");
    const rows = await q;
    res.json(rows);
  } catch (err) {
    console.error("[GET /contas-a-pagar/destinos-tipo] erro:", err);
    if (isMissingTableOrColumn(err)) return res.json([]);
    res.status(500).json({ error: "Falha ao listar destinos tipo." });
  }
});

/* =========================
 * GET /api/contas-a-pagar
 * ======================= */
router.get("/", async (req, res) => {
  try {
    const q = listQuery.parse(req.query);
    const { statusByCode } = await getDomIds();

    const baseQ = () =>
      db("contas_a_pagar as cap")
        .select(
          "cap.id",
          db.raw("to_char(cap.data_emissao, 'YYYY-MM-DD') as data_emissao"),
          db.raw("to_char(cap.data_vencimento, 'YYYY-MM-DD') as data_vencimento"),
          db.raw("to_char(cap.data_pagamento, 'YYYY-MM-DD') as data_pagamento"),
          "cap.destino_tipo_id",
          "cap.destino_id",
          "cap.tipo_id",
          "cap.valor_centavos",
          "cap.forma_pagamento_id",
          "cap.status_id",
          "cap.conta_id",
          "cap.descricao",
          "dt.codigo as destino_tipo_codigo_raw",
          "st.codigo as status_codigo",
          db.raw("coalesce(fu.nome, fo.nome) as destino_nome"),
          db.raw(`
            CASE
              WHEN lower(coalesce(fp.nome,'')) LIKE '%boleto%' 
                OR lower(coalesce(fp.nome,'')) LIKE 'bol%' 
                OR lower(coalesce(fp.nome,'')) LIKE '% bol %' 
                OR lower(coalesce(fp.nome,'')) LIKE '% bol.%'
              THEN 'boleto'
              WHEN lower(coalesce(fp.nome,'')) LIKE '%pix%' THEN 'pix'
              WHEN lower(coalesce(fp.nome,'')) LIKE '%dinheiro%'
                OR lower(coalesce(fp.nome,'')) LIKE '%espécie%'
                OR lower(coalesce(fp.nome,'')) LIKE '%especie%'
                OR lower(coalesce(fp.nome,'')) LIKE '%cash%'
              THEN 'dinheiro'
              ELSE 'outros'
            END AS canal
          `)
        )
        .leftJoin("contas_a_pagar_destino_tipo as dt", "dt.id", "cap.destino_tipo_id")
        .join("contas_a_pagar_status as st", "st.id", "cap.status_id")
        .leftJoin("funcionarios as fu", function () {
          this.on("fu.id", "cap.destino_id").andOn("cap.destino_tipo_id", "=", DESTINO_ID_FUNC);
        })
        .leftJoin("fornecedores as fo", function () {
          this.on("fo.id", "cap.destino_id").andOn("cap.destino_tipo_id", "=", DESTINO_ID_FORN);
        })
        .leftJoin("forma_pagamento as fp", "fp.id", "cap.forma_pagamento_id");

    const applyFilters = (rowsQ) => {
      if (q.de)  rowsQ.andWhereRaw("COALESCE(cap.data_vencimento, cap.data_emissao) >= ?", [q.de]);
      if (q.ate) rowsQ.andWhereRaw("COALESCE(cap.data_vencimento, cap.data_emissao) <= ?", [q.ate]);

      if (q.status && q.status !== "todos") {
        const key = String(q.status).toLowerCase();
        if (key === "atrasado") {
          const stAberto = statusByCode["aberto"];
          if (stAberto) rowsQ.andWhere("cap.status_id", stAberto);
          rowsQ.andWhereNull("cap.data_pagamento");
          rowsQ.andWhereRaw("COALESCE(cap.data_vencimento, cap.data_emissao) < CURRENT_DATE");
        } else if (key === "pago") {
          const stPago = statusByCode["pago"];
          if (stPago != null) rowsQ.andWhere("cap.status_id", stPago);
          else rowsQ.andWhereNotNull("cap.data_pagamento");
        } else if (key === "aberto") {
          const stAberto = statusByCode["aberto"];
          if (stAberto != null) rowsQ.andWhere("cap.status_id", stAberto);
          else rowsQ.andWhereNull("cap.data_pagamento");
        } else if (key === "cancelado") {
          const stCancel = statusByCode["cancelado"];
          if (stCancel != null) rowsQ.andWhere("cap.status_id", stCancel);
        }
      }

      rowsQ.orderBy([
        { column: "cap.status_id", order: "asc" },
        { column: db.raw("COALESCE(cap.data_vencimento, cap.data_emissao)"), order: "asc" }
      ]);
      return rowsQ;
    };

    const rowsRaw = await applyFilters(baseQ());
    const rows = rowsRaw.map((r) => ({
      ...r,
      destino_tipo_codigo: destinoTipoToFrontend(r.destino_tipo_id, r.destino_tipo_codigo_raw),
    }));

    res.json(rows);
  } catch (err) {
    console.error("[GET /contas-a-pagar] erro:", err);
    if (isMissingTableOrColumn(err)) return res.json([]);
    res.status(500).json({ error: "Falha ao listar contas a pagar." });
  }
});

/* =========================
 * POST /api/contas-a-pagar
 * ======================= */
router.post("/", async (req, res) => {
  try {
    const body = criarBody.parse(req.body);
    const { statusByCode, destinoByCode } = await getDomIds();

    // Resolve destino_tipo_id a partir de destino_tipo (string) ou usa destino_tipo_id direto
    let destino_tipo_id = body.destino_tipo_id;
    if (!destino_tipo_id && body.destino_tipo) {
      const key = String(body.destino_tipo).toLowerCase();
      destino_tipo_id = destinoByCode[key];
      if (!destino_tipo_id) {
        return res.status(400).json({ error: "destino_tipo inválido (não encontrado no domínio)" });
      }
    }

    // valida destino_id baseado no tipo (quando fornecido)
    if (destino_tipo_id === DESTINO_ID_FUNC) {
      if (!body.destino_id) return res.status(400).json({ error: "destino_id é obrigatório para funcionário" });
      const ok = await db("funcionarios").where({ id: body.destino_id, ativo: true }).first("id");
      if (!ok) return res.status(400).json({ error: "destino_id inválido para funcionário (ou inativo)" });
    } else if (destino_tipo_id === DESTINO_ID_FORN) {
      if (!body.destino_id) return res.status(400).json({ error: "destino_id é obrigatório para fornecedor" });
      const ok = await db("fornecedores").where({ id: body.destino_id, ativo: true }).first("id");
      if (!ok) return res.status(400).json({ error: "destino_id inválido para fornecedor (ou inativo)" });
    }

    const okConta = await db("conta").where({ id: body.conta_id }).first("id");
    if (!okConta) return res.status(400).json({ error: "conta_id inválido" });

    if (body.forma_pagamento_id !== undefined) {
      const okFP = await db("forma_pagamento").where({ id: body.forma_pagamento_id }).first("id");
      if (!okFP) return res.status(400).json({ error: "forma_pagamento_id inválido" });
    }

    const stAberto = (await getDomIds()).statusByCode["aberto"];
    if (!stAberto) return res.status(500).json({ error: "domínio de status ausente ('ABERTO' etc.)" });

    const [inserted] = await db("contas_a_pagar")
      .insert({
        data_emissao: body.data_emissao,
        data_vencimento: body.data_vencimento ?? null,
        data_pagamento: null,
        destino_tipo_id: destino_tipo_id ?? null, // ✅ pode ser nulo
        destino_id: body.destino_id ?? null,      // ✅ pode ser nulo
        tipo_id: 0,
        valor_centavos: body.valor_centavos,
        forma_pagamento_id: body.forma_pagamento_id ?? null,
        status_id: stAberto,
        conta_id: body.conta_id,
        descricao: body.descricao ?? null,
        criado_em: db.fn.now(),
        modificado_em: db.fn.now(),
      })
      .returning("*");

    const norm = {
      ...inserted,
      data_emissao: inserted.data_emissao ? String(inserted.data_emissao).slice(0,10) : null,
      data_vencimento: inserted.data_vencimento ? String(inserted.data_vencimento).slice(0,10) : null,
      data_pagamento: inserted.data_pagamento ? String(inserted.data_pagamento).slice(0,10) : null,
    };

    res.status(201).json(norm);
  } catch (err) {
    if (err?.code === "23503") {
      return res.status(400).json({ error: "violação de FK (verifique destino_id, conta_id ou forma_pagamento_id)" });
    }
    if (err?.code === "23505") {
      return res.status(409).json({ error: "registro duplicado" });
    }
    console.error("[POST /contas-a-pagar] erro:", err);
    res.status(500).json({ error: "Falha ao criar conta a pagar." });
  }
});

/* =========================
 * POST /api/contas-a-pagar/:id/pagar
 * ======================= */
router.post("/:id/pagar", async (req, res) => {
  try {
    const capId = z.string().uuid().parse(req.params.id);
    const body = pagarBody.parse(req.body);
    const { statusByCode } = await getDomIds();

    const cap = await db("contas_a_pagar").where({ id: capId }).first();
    if (!cap) return res.status(404).json({ error: "Conta a pagar não encontrada" });

    const stPago = statusByCode["pago"];
    const stCancel = statusByCode["cancelado"];
    if (!stPago || !stCancel) {
      return res.status(500).json({ error: "domínio contas_a_pagar_status ausente ('PAGO','CANCELADO')" });
    }
    if (cap.status_id === stPago)   return res.status(409).json({ error: "Conta já está paga" });
    if (cap.status_id === stCancel) return res.status(409).json({ error: "Conta cancelada não pode ser paga" });

    const okCC = await db("contas_corrente").where({ id: body.conta_corrente_id, ativa: true }).first("id");
    if (!okCC) return res.status(400).json({ error: "conta_corrente_id inválida ou inativa" });

    const okFP = await db("forma_pagamento").where({ id: body.forma_pagamento_id }).first("id");
    if (!okFP) return res.status(400).json({ error: "forma_pagamento_id inválido" });

    const destRow = cap.destino_tipo_id
      ? await db("contas_a_pagar_destino_tipo").select("id", db.raw("LOWER(codigo) as codigo")).where({ id: cap.destino_tipo_id }).first()
      : null;

    const result = await db.transaction(async (trx) => {
      const [capUpd] = await trx("contas_a_pagar")
        .where({ id: cap.id })
        .update({
          status_id: stPago,
          data_pagamento: body.data_pagamento,
          modificado_em: trx.fn.now(),
        })
        .returning("*");

      const saidaLabel = await pickSaidaLabel(trx);
      const [mov] = await trx("contas_corrente_movimento")
        .insert({
          data: body.data_pagamento,
          conta_id: cap.conta_id,
          conta_corrente_id: body.conta_corrente_id,
          valor_centavos: cap.valor_centavos,
          direcao: trx.raw("?::mov_direcao", [saidaLabel]),
          forma_pagamento_id: body.forma_pagamento_id,
          descricao: body.descricao_mov ?? cap.descricao ?? `Baixa CAP ${cap.id}`,
        })
        .returning("*");

      if (cap.destino_tipo_id === DESTINO_ID_FUNC || destRow?.codigo === "func") {
        if (!body.funcionario_tipo_saida_id) {
          return Promise.reject(Object.assign(new Error("funcionario_tipo_saida_id é obrigatório para pagamentos de funcionário"), { status: 400 }));
        }
        const okTipo = await trx("funcionario_tipo_saida").where({ id: body.funcionario_tipo_saida_id, ativo: true }).first("id");
        if (!okTipo) return Promise.reject(Object.assign(new Error("funcionario_tipo_saida_id inválido"), { status: 400 }));

        await trx("ccm_saida_funcionario").insert({
          movimento_id: mov.id,
          funcionario_id: cap.destino_id,
          tipo_saida_id: body.funcionario_tipo_saida_id,
        });
      } else if (cap.destino_tipo_id === DESTINO_ID_FORN || destRow?.codigo === "forn") {
        await trx("ccm_saida_fornecedor").insert({
          movimento_id: mov.id,
          fornecedor_id: cap.destino_id,
        });
      }

      const normCap = {
        ...capUpd,
        data_emissao: capUpd.data_emissao ? String(capUpd.data_emissao).slice(0,10) : null,
        data_vencimento: capUpd.data_vencimento ? String(capUpd.data_vencimento).slice(0,10) : null,
        data_pagamento: capUpd.data_pagamento ? String(capUpd.data_pagamento).slice(0,10) : null,
      };

      return { cap: normCap, movimento: mov };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("[POST /contas-a-pagar/:id/pagar] erro:", err);
    if (err?.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: "Falha ao pagar a conta." });
  }
});

export default router;
