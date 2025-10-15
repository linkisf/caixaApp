import { z } from "zod";

export const transferenciaSchema = z.object({
  data_mov: z.string().date().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  origem_id: z.string().uuid(),
  destino_id: z.string().uuid(),
  meio_pagamento_id: z.number().int().positive().optional().nullable(),
  valor_centavos: z.number().int().positive(),
  descricao: z.string().trim().optional().nullable(),
  criado_por_id: z.string().uuid().optional().nullable(),
}).refine((b) => b.origem_id !== b.destino_id, {
  message: "origem_id e destino_id devem ser diferentes."
});
