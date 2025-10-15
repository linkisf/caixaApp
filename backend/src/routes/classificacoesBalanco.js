// backend/src/routes/classificacoesBalanco.js
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

// domínio do agrupador do Balanço
const GRUPOS = ["ATIVO", "PASSIVO", "PL"];

// validações
const codigoRe = /^[0-9A-Za-z.\-_/]+$/;

const schemaCreate = z.object({
  codigo: z.string().trim().min(1).regex(codigoRe, 'Use letras/números e (., -, _, /).'),
  grupo: z.enum(["ATIVO", "PASSIVO", "PL"]),
  nome: z.string().trim().min(2),
  ordem: z.number().int().min(0).optional(), // default 999 se não vier
  // se sua tabela tiver 'ativa', pode incluir aqui (opcional)
});

const schemaUpdate = z.object({
  codigo: z.string().trim().min(1).regex(codigoRe).optional(),
  grupo: z.enum(["ATIVO", "PASSIVO", "PL"]).optional(),
  nome: z.string().trim().min(2).optional(),
  ordem: z.number().int().min(0).optional(),
});

// LISTAR
router.get("/", async (_req, res, next) => {
  try {
    const rows = await db("classificacao_balanco")
      .select("id", "codigo", "grupo", "nome", "ordem")
      .orderBy([{ column: "ordem", order: "asc" }, { column: "codigo", order: "asc" }]);

    res.json(rows);
  } catch (err) { next(err); }
});

// OBTER 1
router.get("/:id", async (req, res, next) => {
  try {
    const row = await db("classificacao_balanco")
      .select("id", "codigo", "grupo", "nome", "ordem")
      .where({ id: req.params.id })
      .first();

    if (!row) return res.status(404).json({ error: "Classificação não encontrada" });
    res.json(row);
  } catch (err) { next(err); }
});

// CRIAR
router.post("/", async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", issues: parsed.error.issues });
    }
    const p = parsed.data;

    if (!GRUPOS.includes(p.grupo)) {
      return res.status(400).json({ error: "grupo inválido" });
    }

    const [row] = await db("classificacao_balanco")
      .insert({
        codigo: p.codigo,
        grupo: p.grupo,
        nome: p.nome,
        ordem: p.ordem ?? 999,
      })
      .returning(["id", "codigo", "grupo", "nome", "ordem"]);

    return res.status(201).json(row);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Já existe uma classificação com esse código." });
    }
    next(err);
  }
});

// ATUALIZAR
router.put("/:id", async (req, res, next) => {
  try {
    const parsed = schemaUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", issues: parsed.error.issues });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nada para atualizar" });
    }

    if (patch.grupo && !GRUPOS.includes(patch.grupo)) {
      return res.status(400).json({ error: "grupo inválido" });
    }

    const [row] = await db("classificacao_balanco")
      .where({ id: req.params.id })
      .update(
        { ...patch },
        ["id", "codigo", "grupo", "nome", "ordem"]
      );

    if (!row) return res.status(404).json({ error: "Classificação não encontrada" });
    res.json(row);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Já existe uma classificação com esse código." });
    }
    next(err);
  }
});

// EXCLUIR
router.delete("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;

    // bloqueia se houver contas vinculadas
    const hasConta = await db("conta").where({ classificacao_balanco_id: id }).first("id");
    if (hasConta) {
      return res.status(409).json({ error: "Não é possível excluir: há contas vinculadas a esta classificação." });
    }

    const del = await db("classificacao_balanco").where({ id }).del();
    if (!del) return res.status(404).json({ error: "Classificação não encontrada" });

    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
