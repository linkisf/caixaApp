import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

const schemaCreate = z.object({
  nome: z.string().trim().min(2).max(100),
  ativo: z.boolean().optional().default(true),
});

const schemaUpdate = z.object({
  nome: z.string().trim().min(2).max(100).optional(),
  ativo: z.boolean().optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** GET /funcionarios/tipos-saida */
router.get("/", async (_req, res, next) => {
  try {
    const rows = await db("funcionario_tipo_saida")
      .select("id", "nome", "ativo", "criado_em", "modificado_em")
      .orderBy("ativo", "desc")
      .orderBy("nome", "asc");
    res.json(rows);
  } catch (err) { next(err); }
});

/** POST /funcionarios/tipos-saida */
router.post("/", async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || "Payload inválido" });
    const data = parsed.data;

    const exists = await db("funcionario_tipo_saida").whereRaw("lower(nome) = lower(?)", [data.nome]).first();
    if (exists) return res.status(409).json({ error: "Já existe um tipo com esse nome." });

    const [row] = await db("funcionario_tipo_saida")
      .insert({ nome: data.nome, ativo: data.ativo ?? true })
      .returning(["id", "nome", "ativo", "criado_em", "modificado_em"]);

    res.status(201).json(row);
  } catch (err) { next(err); }
});

/** PUT /funcionarios/tipos-saida/:id */
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const parsed = schemaUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || "Payload inválido" });
    const data = parsed.data;

    if (data.nome) {
      const dup = await db("funcionario_tipo_saida")
        .whereRaw("lower(nome) = lower(?)", [data.nome])
        .andWhereNot("id", id)
        .first();
      if (dup) return res.status(409).json({ error: "Já existe um tipo com esse nome." });
    }

    const [row] = await db("funcionario_tipo_saida")
      .where({ id })
      .update({ ...data })
      .returning(["id", "nome", "ativo", "criado_em", "modificado_em"]);

    if (!row) return res.status(404).json({ error: "Não encontrado" });
    res.json(row);
  } catch (err) { next(err); }
});

/** DELETE /funcionarios/tipos-saida/:id */
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);

    // bloqueios explícitos
    const [{ count: capCount }] = await db("contas_a_pagar")
      .where("funcionario_tipo_saida_id", id)
      .count({ count: "*" });

    if (Number(capCount) > 0) {
      return res.status(409).json({ error: "Tipo está em uso em contas a pagar de funcionários." });
    }

    const [{ count: ccmCount }] = await db("ccm_saida_funcionario")
      .where("tipo_saida_id", id)
      .count({ count: "*" });

    if (Number(ccmCount) > 0) {
      return res.status(409).json({ error: "Tipo está em uso em movimentações de saída de funcionários." });
    }

    const del = await db("funcionario_tipo_saida").where({ id }).del();
    if (!del) return res.status(404).json({ error: "Não encontrado" });
    return res.status(204).send();
  } catch (err) {
    if (err?.code === "23503") {
      return res.status(409).json({ error: "Não é possível excluir: registro está referenciado." });
    }
    return next(err);
  }
});

export default router;
