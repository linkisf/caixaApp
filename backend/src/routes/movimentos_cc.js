// backend/src/routes/movimentos_cc.js
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

const schemaCreate = z.object({
  data: z.string().date().or(z.string()), // aceitar 'YYYY-MM-DD'
  conta_id: z.string().uuid(),
  conta_corrente_id: z.string().uuid(),
  valor_centavos: z.number().int().positive(),
  direcao: z.enum(['recebido','pago']),
  forma_pagamento_id: z.number().int().positive(),
  descricao: z.string().trim().nullable().optional(),
});

router.get("/", async (_req, res, next) => {
  try {
    const rows = await db("conta_corrente_movimento as m")
      .select(
        "m.id","m.data","m.valor_centavos","m.direcao","m.descricao","m.criado_em",
        "m.conta_id","c.codigo as conta_codigo","c.nome as conta_nome",
        "m.conta_corrente_id","cc.nome as conta_corrente_nome",
        "m.forma_pagamento_id","fp.nome as forma_pagamento_nome",
      )
      .leftJoin("conta as c", "c.id", "m.conta_id")
      .leftJoin("conta_corrente as cc", "cc.id", "m.conta_corrente_id")
      .leftJoin("forma_pagamento as fp", "fp.id", "m.forma_pagamento_id")
      .orderBy([{ column: "m.data", order: "desc" }, { column: "m.criado_em", order: "desc" }]);

    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Payload inválido", issues: parsed.error.issues });
    const p = parsed.data;

    // valida FKs mínimas
    const okConta = await db("conta").where({ id: p.conta_id }).first("id");
    if (!okConta) return res.status(400).json({ error: "conta_id inválido" });

    const okCC = await db("conta_corrente").where({ id: p.conta_corrente_id }).first("id");
    if (!okCC) return res.status(400).json({ error: "conta_corrente_id inválido" });

    const okFP = await db("forma_pagamento").where({ id: p.forma_pagamento_id }).first("id");
    if (!okFP) return res.status(400).json({ error: "forma_pagamento_id inválido" });

    const [row] = await db("conta_corrente_movimento")
      .insert({
        data: p.data, conta_id: p.conta_id, conta_corrente_id: p.conta_corrente_id,
        valor_centavos: p.valor_centavos, direcao: p.direcao,
        forma_pagamento_id: p.forma_pagamento_id, descricao: p.descricao ?? null,
      })
      .returning("*"); // trigger ajusta o saldo

    return res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const del = await db("conta_corrente_movimento").where({ id: req.params.id }).del().returning("id");
    if (!del?.length) return res.status(404).json({ error: "Movimento não encontrado" });
    return res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
