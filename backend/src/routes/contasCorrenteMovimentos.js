import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

// mergeParams para acessar :contaId vindo do app.use('/.../:contaId/movimentos', router)
const router = Router({ mergeParams: true });

// valida param e filtros simples
const paramSchema = z.object({ contaId: z.string().uuid() });
const querySchema = z.object({
  // filtros opcionais
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // YYYY-MM-DD
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  forma_pagamento_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/", async (req, res, next) => {
  try {
    const { contaId } = paramSchema.parse(req.params);
    const q = querySchema.parse(req.query);

    // garante que a conta existe e está ativa (opcional, mas útil)
    const cc = await db("contas_corrente").where({ id: contaId }).first("id", "ativa");
    if (!cc) return res.status(404).json({ error: "Conta corrente não encontrada" });
    if (cc.ativa === false) return res.status(400).json({ error: "Conta corrente inativa" });

    const rowsQ = db("contas_corrente_movimento as m")
      .select(
        "m.id","m.data","m.valor_centavos","m.direcao","m.descricao","m.criado_em",
        "m.conta_id","c.codigo as conta_codigo","c.nome as conta_nome",
        "m.conta_corrente_id","cc.nome as conta_corrente_nome",
        "m.forma_pagamento_id","fp.nome as forma_pagamento_nome",
        "m.transfer_group_id"
      )
      .leftJoin("conta as c", "c.id", "m.conta_id")
      .leftJoin("contas_corrente as cc", "cc.id", "m.conta_corrente_id")
      .leftJoin("forma_pagamento as fp", "fp.id", "m.forma_pagamento_id")
      .where("m.conta_corrente_id", contaId);

    if (q.de)  rowsQ.andWhere("m.data", ">=", q.de);
    if (q.ate) rowsQ.andWhere("m.data", "<=", q.ate);
    if (q.forma_pagamento_id) rowsQ.andWhere("m.forma_pagamento_id", q.forma_pagamento_id);

    const [{ count }] = await db("contas_corrente_movimento as m")
      .where("m.conta_corrente_id", contaId)
      .modify((qb) => {
        if (q.de)  qb.andWhere("m.data", ">=", q.de);
        if (q.ate) qb.andWhere("m.data", "<=", q.ate);
        if (q.forma_pagamento_id) qb.andWhere("m.forma_pagamento_id", q.forma_pagamento_id);
      })
      .count({ count: "*" });

    const rows = await rowsQ
      .orderBy([{ column: "m.data", order: "desc" }, { column: "m.criado_em", order: "desc" }])
      .limit(q.limit)
      .offset(q.offset);

    res.json({ total: Number(count ?? 0), items: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
