// backend/src/routes/entradas.js
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

// ====== SCHEMAS ======
const schemaCreate = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  conta_id: z.coerce.number().int().positive(),        // INTEGER
  conta_corrente_id: z.string().uuid(),                // UUID
  valor_centavos: z.coerce.number().int().positive(),
  direcao: z.enum(["recebido"]).optional(),
  forma_pagamento_id: z.coerce.number().int().positive(),
  descricao: z.string().trim().nullable().optional(),
});

// ⚠️ Importante: não use z.coerce.date() aqui
const schemaQuery = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conta_corrente_id: z.string().uuid().optional(),
  forma_pagamento_id: z.coerce.number().int().positive().optional(),
}).strict();

// ====== LISTAR ENTRADAS ======
router.get("/", async (req, res, next) => {
  try {
    const parsed = schemaQuery.safeParse(req.query);
    // Se query inválida, ignore filtros (evita 400)
    let { de, ate, conta_corrente_id, forma_pagamento_id } = parsed.success ? parsed.data : {};

    // Como estão em YYYY-MM-DD, comparação de string funciona
    if (de && ate && de > ate) { const t = de; de = ate; ate = t; }

    const rowsQ = db("contas_corrente_movimento as m")
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
      .leftJoin({ c: "conta" }, "c.id", "m.conta_id")            // conta.id INTEGER
      .leftJoin({ cc: "contas_corrente" }, "cc.id", "m.conta_corrente_id")
      .leftJoin({ fp: "forma_pagamento" }, "fp.id", "m.forma_pagamento_id")
      .whereNotNull("m.conta_id")
      .andWhere("m.direcao", "recebido");

    if (de) rowsQ.andWhere("m.data", ">=", de);   // inclui o dia inicial
    if (ate) rowsQ.andWhere("m.data", "<=", ate); // inclui o dia final (agora correto)
    if (conta_corrente_id) rowsQ.andWhere("m.conta_corrente_id", conta_corrente_id);
    if (forma_pagamento_id) rowsQ.andWhere("m.forma_pagamento_id", forma_pagamento_id);

    const rows = await rowsQ
      .orderBy([{ column: "m.data", order: "desc" }, { column: "m.criado_em", order: "desc" }]);

    res.json(rows);
  } catch (err) { next(err); }
});

// ====== CRIAR ENTRADA ======
router.post("/", async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Payload inválido", issues: parsed.error.issues });
    const p = parsed.data;

    const okConta = await db("conta").where({ id: p.conta_id, ativa: true }).first("id");
    if (!okConta) return res.status(400).json({ error: "conta_id inválido ou inativa" });

    const okCC = await db("contas_corrente").where({ id: p.conta_corrente_id, ativa: true }).first("id");
    if (!okCC) return res.status(400).json({ error: "conta_corrente_id inválido ou inativa" });

    const okFP = await db("forma_pagamento").where({ id: p.forma_pagamento_id }).first("id");
    if (!okFP) return res.status(400).json({ error: "forma_pagamento_id inválido" });

    const [row] = await db("contas_corrente_movimento")
      .insert({
        data: p.data,
        conta_id: p.conta_id,
        conta_corrente_id: p.conta_corrente_id,
        valor_centavos: p.valor_centavos,
        direcao: "recebido",
        forma_pagamento_id: p.forma_pagamento_id,
        descricao: p.descricao ?? null,
      })
      .returning("*");

    res.status(201).json(row);
  } catch (err) { next(err); }
});

// ====== EXCLUIR ENTRADA ======
router.delete("/:id", async (req, res, next) => {
  try {
    const del = await db("contas_corrente_movimento")
      .where({ id: req.params.id, direcao: "recebido" })
      .del()
      .returning("id");
    if (!del?.length) return res.status(404).json({ error: "Entrada não encontrada" });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
