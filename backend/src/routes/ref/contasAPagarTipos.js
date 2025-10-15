import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.js";

const router = Router();

/** Schemas */
const listQuerySchema = z.object({
ativos: z.string().optional(), // "true" para filtrar apenas ativos
q: z.string().optional(), // busca por nome
});

const createSchema = z.object({
nome: z.string().min(1),
ativo: z.boolean().optional().default(true),
});

const updateSchema = z.object({
nome: z.string().min(1).optional(),
ativo: z.boolean().optional(),
});

/** GET /api/ref/contas-a-pagar-tipos */
router.get("/", async (req, res, next) => {
try {
    const { success, data, error } = listQuerySchema.safeParse(req.query);
    if (!success) return res.status(400).json({ error: error.issues });

    const { ativos, q } = data;

    let query = db("contas_a_pagar_tipo").select("id", "nome", "ativo").orderBy("nome", "asc");

    if (ativos === "true") query = query.where({ ativo: true });
    if (q && q.trim()) query = query.whereILike("nome", `%${q.trim()}%`);

    const rows = await query;
    res.json(rows);
    } catch (err) {
next(err);
}
});

/** GET /api/ref/contas-a-pagar-tipos/:id */
router.get("/:id", async (req, res, next) => {
    try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

    const row = await db("contas_a_pagar_tipo").select("id", "nome", "ativo").where({ id }).first();
    if (!row) return res.status(404).json({ error: "não encontrado" });
    res.json(row);
    } catch (err) {
next(err);
}
});

/** POST /api/ref/contas-a-pagar-tipos */
router.post("/", async (req, res, next) => {
    try {
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.issues });
    const { nome, ativo } = parse.data;

    const [inserted] = await db("contas_a_pagar_tipo")
    .insert({ nome, ativo })
    .returning(["id", "nome", "ativo"]);

    res.status(201).json(inserted);
    } catch (err) {
    // trata violação de UNIQUE(nome)
    if (err?.code === "23505") {
    return res.status(409).json({ error: "nome já existente" });
    }
    next(err);
    }
    });

    /** PUT /api/ref/contas-a-pagar-tipos/:id */
    router.put("/:id", async (req, res, next) => {
    try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
    const parse = updateSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.issues });

    const patch = parse.data;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "sem campos para atualizar" });

    const [updated] = await db("contas_a_pagar_tipo")
    .where({ id })
    .update(patch)
    .returning(["id", "nome", "ativo"]);

    if (!updated) return res.status(404).json({ error: "não encontrado" });
    res.json(updated);
    } catch (err) {
    if (err?.code === "23505") {
    return res.status(409).json({ error: "nome já existente" });
    }
    next(err);
    }
});

    /** DELETE /api/ref/contas-a-pagar-tipos/:id

    (Opcional: se preferir só desativar, use PUT com { ativo: false })
    */
router.delete("/:id", async (req, res, next) => {
    try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

    const del = await db("contas_a_pagar_tipo").where({ id }).del();
    if (!del) return res.status(404).json({ error: "não encontrado" });

    res.status(204).end();
    } catch (err) {
    next(err);
    }
});

export default router;