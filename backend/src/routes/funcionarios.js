import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

/* ===========================
   Validações / Coerções
=========================== */
const strOpt = z.string().trim().transform(v => (v === '' ? null : v)).optional().nullable();
const moneyCents = z.coerce.number().int().nonnegative().optional(); // salario em centavos (>=0)
const funcaoIdInt = z.coerce.number().int().positive().nullable().optional();

// :id de funcionário é INTEGER
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const baseFields = {
  nome: z.string().trim().min(2),
  funcao_id: funcaoIdInt,        // FK inteiro ou null
  cpf: strOpt,
  rg: strOpt,
  contato: strOpt,
  end_rua: strOpt,
  end_bairro: strOpt,
  end_numero: strOpt,
  salario_base: moneyCents,      // centavos
  ativo: z.coerce.boolean().optional(),
};

const schemaCreate = z.object({ ...baseFields });
const schemaUpdate = z.object(Object.fromEntries(
  Object.entries(baseFields).map(([k, v]) => [k, v.optional()])
));

/* ===========================
   LISTAR
=========================== */
router.get('/', async (req, res, next) => {
  try {
    const onlyAtivos = String(req.query.ativos || '') === 'true';

    const q = db('funcionarios as fu')
      .leftJoin('funcionarios_funcoes as f', 'fu.funcao_id', 'f.id')
      .select(
        'fu.id',
        'fu.nome',
        'fu.funcao_id',
        'fu.cpf',
        'fu.rg',
        'fu.contato',
        'fu.end_rua',
        'fu.end_bairro',
        'fu.end_numero',
        'fu.salario_base',
        'fu.ativo',
        db.raw('f.nome as funcao_nome')
      )
      .orderBy('fu.nome', 'asc');

    if (onlyAtivos) q.where('fu.ativo', true);

    const rows = await q;
    res.json(rows);
  } catch (err) { next(err); }
});

/* ===========================
   OBTER POR ID (INTEGER)
=========================== */
router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const row = await db('funcionarios as fu')
      .leftJoin('funcionarios_funcoes as f', 'fu.funcao_id', 'f.id')
      .select(
        'fu.id',
        'fu.nome',
        'fu.funcao_id',
        'fu.cpf',
        'fu.rg',
        'fu.contato',
        'fu.end_rua',
        'fu.end_bairro',
        'fu.end_numero',
        'fu.salario_base',
        'fu.ativo',
        db.raw('f.nome as funcao_nome')
      )
      .where('fu.id', id)
      .first();

    if (!row) return res.status(404).json({ error: 'Funcionário não encontrado' });
    res.json(row);
  } catch (err) { next(err); }
});

/* ===========================
   CRIAR
=========================== */
router.post('/', async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const p = parsed.data;

    const [row] = await db('funcionarios')
      .insert({
        nome: p.nome,
        funcao_id: p.funcao_id ?? null,
        cpf: p.cpf ?? null,
        rg: p.rg ?? null,
        contato: p.contato ?? null,
        end_rua: p.end_rua ?? null,
        end_bairro: p.end_bairro ?? null,
        end_numero: p.end_numero ?? null,
        salario_base: p.salario_base ?? 0,
        ativo: p.ativo ?? true,
      })
      .returning('*');

    res.status(201).json(row);
  } catch (err) {
    if (err?.code === '23505') { // unique
      return res.status(409).json({ error: 'Conflito de dados (valor já existente).' });
    }
    if (err?.code === '23503') { // FK inválida
      return res.status(400).json({ error: 'Função informada não existe.' });
    }
    next(err);
  }
});

/* ===========================
   EDITAR (INTEGER)
=========================== */
router.put('/:id(\\d+)', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const parsed = schemaUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const [row] = await db('funcionarios')
      .where({ id })
      .update({ ...patch, modificado_em: db.fn.now() })
      .returning('*');

    if (!row) return res.status(404).json({ error: 'Funcionário não encontrado' });
    res.json(row);
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Conflito de dados (valor já existente).' });
    if (err?.code === '23503') return res.status(400).json({ error: 'Função informada não existe.' });
    next(err);
  }
});

/* ===========================
   EXCLUIR (INTEGER)
=========================== */
router.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const vinc = await db('ccm_saida_funcionario').where({ funcionario_id: id }).first('id');
    if (vinc) {
      return res.status(409).json({ error: 'Não é possível excluir: funcionário está vinculado a saídas.' });
    }

    const del = await db('funcionarios').where({ id }).del();
    if (!del) return res.status(404).json({ error: 'Funcionário não encontrado' });

    res.status(204).send();
  } catch (err) {
    if (err?.code === '23503') return res.status(409).json({ error: 'Registro em uso por outras tabelas.' });
    next(err);
  }
});

export default router;
