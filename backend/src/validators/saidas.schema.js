import { z } from "zod";

export const saidaSchema = z.object({
  data_mov: z.string().date().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  conta_corrente_id: z.string().uuid(),
  conta_gerencial_id: z.string().uuid(),
  meio_pagamento_id: z.number().int().positive(),
  ref_sessao_caixa_id: z.number().int().positive().optional().nullable(),
  funcionario_id: z.string().uuid().optional().nullable(),
  valor_centavos: z.number().int().positive(),
  destinatario: z.string().trim().optional().nullable(),
  descricao: z.string().trim().optional().nullable(),
  documento: z.string().trim().optional().nullable(),
  criado_por_id: z.string().uuid().optional().nullable(),
});
