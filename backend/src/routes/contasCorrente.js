// backend/src/routes/contasCorrente.js
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

/* ===== Schemas ===== */
const schemaContaCreate = z.object({
  nome: z.string().trim().min(1),
  banco: z.string().trim().nullable().optional(),
  agencia: z.string().trim().nullable().optional(),
  numero: z.string().trim().nullable().optional(),
  tipo: z.enum(["interna", "externa"]),
  ativa: z.boolean().optional(),
  // saldo inicial só na criação; em centavos
  saldo_inicial_centavos: z.number().int().min(0).optional(),
});

const schemaContaUpdate = z.object({
  nome: z.string().trim().min(1).optional(),
  banco: z.string().trim().nullable().optional(),
  agencia: z.string().trim().nullable().optional(),
  numero: z.string().trim().nullable().optional(),
  tipo: z.enum(["interna", "externa"]).optional(),
  ativa: z.boolean().optional(),
  // saldo_inicial_centavos NÃO é editável aqui
});

/* ===== Rotas: Contas Correntes ===== */

// GET /api/contas-corrente
router.get("/", async (_req, res, next) => {
  try {
    const rows = await db("contas_corrente")
      .select(
        "id",
        "nome",
        "banco",
        "agencia",
        "numero",
        "tipo",
        "saldo_inicial_centavos",
        "saldo_atual_centavos",
        "ativa",
        "criado_em",
        "modificado_em"
      )
      .orderBy("nome", "asc");

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/contas-corrente/:id
router.get("/:id", async (req, res, next) => {
  try {
    const row = await db("contas_corrente")
      .select(
        "id",
        "nome",
        "banco",
        "agencia",
        "numero",
        "tipo",
        "saldo_inicial_centavos",
        "saldo_atual_centavos",
        "ativa",
        "criado_em",
        "modificado_em"
      )
      .where({ id: req.params.id })
      .first();

    if (!row) return res.status(404).json({ error: "Conta corrente não encontrada" });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// POST /api/contas-corrente
router.post("/", async (req, res, next) => {
  try {
    const p = schemaContaCreate.parse(req.body);
    const saldoInicial = Number(p.saldo_inicial_centavos ?? 0);

    const [row] = await db("contas_corrente")
      .insert({
        nome: p.nome,
        banco: p.banco ?? null,
        agencia: p.agencia ?? null,
        numero: p.numero ?? null,
        tipo: p.tipo,
        ativa: p.ativa ?? true,
        saldo_inicial_centavos: saldoInicial,
        saldo_atual_centavos: saldoInicial, // começa igual ao inicial
      })
      .returning([
        "id",
        "nome",
        "banco",
        "agencia",
        "numero",
        "tipo",
        "saldo_inicial_centavos",
        "saldo_atual_centavos",
        "ativa",
        "criado_em",
        "modificado_em",
      ]);

    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

// PUT /api/contas-corrente/:id
router.put("/:id", async (req, res, next) => {
  try {
    const patch = schemaContaUpdate.parse(req.body);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nada para atualizar" });
    }

    const [row] = await db("contas_corrente")
      .where({ id: req.params.id })
      .update({ ...patch, modificado_em: db.fn.now() })
      .returning([
        "id",
        "nome",
        "banco",
        "agencia",
        "numero",
        "tipo",
        "saldo_inicial_centavos",
        "saldo_atual_centavos",
        "ativa",
        "criado_em",
        "modificado_em",
      ]);

    if (!row) return res.status(404).json({ error: "Conta corrente não encontrada" });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contas-corrente/:id
router.delete("/:id", async (req, res, next) => {
  try {
    // bloqueia exclusão se houver movimentos
    const hasMov = await db("contas_corrente_movimento")
      .where({ conta_corrente_id: req.params.id })
      .first("id");

    if (hasMov) {
      return res
        .status(409)
        .json({ error: "Não é possível excluir: conta possui movimentos." });
    }

    const del = await db("contas_corrente").where({ id: req.params.id }).del();
    if (!del) return res.status(404).json({ error: "Conta corrente não encontrada" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
