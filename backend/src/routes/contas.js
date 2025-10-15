// backend/src/routes/contas.js
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

// ============================ Utils ============================
const codigoRe = /^[0-9A-Za-z.\-_/]+$/;

/** Normaliza o nome do tipo_conta para um "grupo lógico" */
function normalizaTipoParaGrupo(nomeTipoRaw = "") {
  const nome = String(nomeTipoRaw).toUpperCase();
  if (nome.includes("RESULT")) return "RESULTADO";
  if (nome.includes("ATIV")) return "ATIVO";
  if (nome.includes("PASS")) return "PASSIVO";
  if (nome.includes("PATRIM") || nome === "PL" || nome.includes("LÍQ") || nome.includes("LIQ")) return "PL";
  return "OUTROS";
}

/** Valida coerência entre tipo_conta e classificacao_balanco */
function validaCoerenciaTipoBalanco({ grupoTipo, grupoBalanco, balancoPreenchido }) {
  // Tipo Resultado NÃO pode ter classificação de Balanço
  if (grupoTipo === "RESULTADO" && balancoPreenchido) {
    return "Tipo de Conta 'Resultado' não deve possuir Classificação de Balanço.";
  }

  // Se há balanco preenchido, deve casar com o grupo do tipo
  if (balancoPreenchido) {
    if (!["ATIVO", "PASSIVO", "PL"].includes(grupoTipo)) {
      return `Tipo de Conta incompatível com Balanço: esperado um tipo patrimonial (Ativo/Passivo/PL) para usar classificação de Balanço, recebido '${grupoTipo}'.`;
    }
    if (grupoTipo !== grupoBalanco) {
      return `Inconsistência entre Tipo de Conta (${grupoTipo}) e Classificação de Balanço (${grupoBalanco}).`;
    }
  }

  // (Opcional) Se quiser forçar que tipos patrimoniais EXIJAM preenchimento de classificação de Balanço, descomente:
  // if (["ATIVO", "PASSIVO", "PL"].includes(grupoTipo) && !balancoPreenchido) {
  //   return `Tipo de Conta ${grupoTipo} requer Classificação de Balanço preenchida.`;
  // }

  return null; // ok
}

// ============================ Schemas ============================
const schemaCreate = z.object({
  codigo: z.string().trim().min(1).regex(codigoRe, 'Use letras/números e (., -, _, /).'),
  nome: z.string().trim().min(2),
  nivel: z.number().int().min(1),
  conta_pai_id: z.string().uuid().nullable().optional(),
  tipo_conta_id: z.number().int(),
  classificacao_dre_id: z.number().int().nullable().optional(),
  classificacao_balanco_id: z.number().int().nullable().optional(),
  natureza_id: z.number().int().nullable().optional(),
  conta_direcao_id: z.number().int(),
  ativa: z.boolean().optional(),
});

const schemaUpdate = z.object({
  codigo: z.string().trim().min(1).regex(codigoRe).optional(),
  nome: z.string().trim().min(2).optional(),
  nivel: z.number().int().min(1).optional(),
  conta_pai_id: z.string().uuid().nullable().optional(),
  tipo_conta_id: z.number().int().optional(),
  classificacao_dre_id: z.number().int().nullable().optional(),
  classificacao_balanco_id: z.number().int().nullable().optional(),
  natureza_id: z.number().int().nullable().optional(),
  conta_direcao_id: z.number().int().optional(),
  ativa: z.boolean().optional(),
});

// ============================ LISTAR ============================
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('conta')
      .select(
        'id',
        'codigo',
        'nome',
        'nivel',
        'conta_pai_id',
        'tipo_conta_id',
        'classificacao_dre_id',
        'classificacao_balanco_id',
        'natureza_id',
        'conta_direcao_id',
        'ativa'
      )
      .orderBy('codigo', 'asc');

    res.json(rows);
  } catch (err) { next(err); }
});

// ============================ OBTER 1 ============================
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db('conta')
      .select(
        'id',
        'codigo',
        'nome',
        'nivel',
        'conta_pai_id',
        'tipo_conta_id',
        'classificacao_dre_id',
        'classificacao_balanco_id',
        'natureza_id',
        'conta_direcao_id',
        'ativa'
      )
      .where({ id: req.params.id })
      .first();

    if (!row) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json(row);
  } catch (err) { next(err); }
});

// ============================ CRIAR ============================
router.post('/', async (req, res, next) => {
  try {
    const parsed = schemaCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const p = parsed.data;

    // valida FKs existentes
    const tipo = await db('tipo_conta').where({ id: p.tipo_conta_id }).first('id', 'nome');
    if (!tipo) return res.status(400).json({ error: 'tipo_conta_id inválido.' });

    let grupoBalanco = null;
    if (p.classificacao_balanco_id != null) {
      const bal = await db('classificacao_balanco').where({ id: p.classificacao_balanco_id }).first('id', 'grupo');
      if (!bal) return res.status(400).json({ error: 'classificacao_balanco_id inválido.' });
      grupoBalanco = String(bal.grupo).toUpperCase(); // ATIVO|PASSIVO|PL
    }

    if (p.classificacao_dre_id != null) {
      const dre = await db('classificacao_dre').where({ id: p.classificacao_dre_id }).first('id');
      if (!dre) return res.status(400).json({ error: 'classificacao_dre_id inválido.' });
    }

    if (p.natureza_id != null) {
      const nat = await db('natureza').where({ id: p.natureza_id }).first('id');
      if (!nat) return res.status(400).json({ error: 'natureza_id inválido.' });
    }

    const dir = await db('conta_direcao').where({ id: p.conta_direcao_id }).first('id');
    if (!dir) return res.status(400).json({ error: 'conta_direcao_id inválido.' });

    if (p.conta_pai_id) {
      const pai = await db('conta').where({ id: p.conta_pai_id }).first('id', 'nivel');
      if (!pai) return res.status(400).json({ error: 'conta_pai_id inválido.' });
      // (Opcional) p.nivel = pai.nivel + 1;
    }

    // --------- Validação de coerência Tipo x Balanço ----------
    const grupoTipo = normalizaTipoParaGrupo(tipo.nome);
    const msg = validaCoerenciaTipoBalanco({
      grupoTipo,
      grupoBalanco,
      balancoPreenchido: p.classificacao_balanco_id != null,
    });
    if (msg) return res.status(400).json({ error: msg });

    const [row] = await db('conta')
      .insert({
        codigo: p.codigo,
        nome: p.nome,
        nivel: p.nivel,
        conta_pai_id: p.conta_pai_id ?? null,
        tipo_conta_id: p.tipo_conta_id,
        classificacao_dre_id: p.classificacao_dre_id ?? null,
        classificacao_balanco_id: p.classificacao_balanco_id ?? null,
        natureza_id: p.natureza_id ?? null,
        conta_direcao_id: p.conta_direcao_id,
        ativa: p.ativa ?? true,
      })
      .returning([
        'id','codigo','nome','nivel','conta_pai_id',
        'tipo_conta_id','classificacao_dre_id','classificacao_balanco_id',
        'natureza_id','conta_direcao_id','ativa'
      ]);

    return res.status(201).json(row);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma conta com esse código.' });
    }
    next(err);
  }
});

// ============================ ATUALIZAR ============================
router.put('/:id', async (req, res, next) => {
  try {
    const parsed = schemaUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    // Carrega estado atual para validar coerência com campos não enviados
    const atual = await db('conta')
      .select(
        'id',
        'tipo_conta_id',
        'classificacao_balanco_id'
      )
      .where({ id: req.params.id })
      .first();
    if (!atual) return res.status(404).json({ error: 'Conta não encontrada' });

    // Determina valores finais (atuais ou patch)
    const tipoIdFinal = patch.tipo_conta_id ?? atual.tipo_conta_id;
    const balIdFinal  = (patch.hasOwnProperty('classificacao_balanco_id'))
      ? patch.classificacao_balanco_id
      : atual.classificacao_balanco_id;

    // valida FKs conforme vierem/ficarem
    const tipo = await db('tipo_conta').where({ id: tipoIdFinal }).first('id', 'nome');
    if (!tipo) return res.status(400).json({ error: 'tipo_conta_id inválido.' });

    let grupoBalanco = null;
    if (balIdFinal != null) {
      const bal = await db('classificacao_balanco').where({ id: balIdFinal }).first('id', 'grupo');
      if (!bal) return res.status(400).json({ error: 'classificacao_balanco_id inválido.' });
      grupoBalanco = String(bal.grupo).toUpperCase();
    }

    if (patch.classificacao_dre_id !== undefined && patch.classificacao_dre_id !== null) {
      const dre = await db('classificacao_dre').where({ id: patch.classificacao_dre_id }).first('id');
      if (!dre) return res.status(400).json({ error: 'classificacao_dre_id inválido.' });
    }

    if (patch.natureza_id !== undefined && patch.natureza_id !== null) {
      const nat = await db('natureza').where({ id: patch.natureza_id }).first('id');
      if (!nat) return res.status(400).json({ error: 'natureza_id inválido.' });
    }

    if (patch.conta_direcao_id !== undefined) {
      const dir = await db('conta_direcao').where({ id: patch.conta_direcao_id }).first('id');
      if (!dir) return res.status(400).json({ error: 'conta_direcao_id inválido.' });
    }

    if (patch.conta_pai_id !== undefined && patch.conta_pai_id !== null) {
      const pai = await db('conta').where({ id: patch.conta_pai_id }).first('id','nivel');
      if (!pai) return res.status(400).json({ error: 'conta_pai_id inválido.' });
    }

    // --------- Validação de coerência Tipo x Balanço ----------
    const grupoTipo = normalizaTipoParaGrupo(tipo.nome);
    const msg = validaCoerenciaTipoBalanco({
      grupoTipo,
      grupoBalanco,
      balancoPreenchido: balIdFinal != null,
    });
    if (msg) return res.status(400).json({ error: msg });

    const [row] = await db('conta')
      .where({ id: req.params.id })
      .update(
        { 
          ...patch,
          atualizado_em: db.fn.now(), // ajuste se a coluna existir
        },
        [
          'id','codigo','nome','nivel','conta_pai_id',
          'tipo_conta_id','classificacao_dre_id','classificacao_balanco_id',
          'natureza_id','conta_direcao_id','ativa'
        ]
      );

    if (!row) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json(row);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma conta com esse código.' });
    }
    next(err);
  }
});

// ============================ EXCLUIR ============================
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;

    const hasChild = await db('conta').where({ conta_pai_id: id }).first('id');
    if (hasChild) {
      return res.status(409).json({ error: 'Não é possível excluir: conta possui contas-filhas.' });
    }

    const hasLcto = await db('lancamento').where({ conta_id: id }).first('id');
    if (hasLcto) {
      return res.status(409).json({ error: 'Não é possível excluir: conta possui lançamentos vinculados.' });
    }

    const del = await db('conta').where({ id }).del();
    if (!del) return res.status(404).json({ error: 'Conta não encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
