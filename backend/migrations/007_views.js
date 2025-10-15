/** Helpful views */
export async function up(knex) {
  await knex.raw(`
    CREATE OR REPLACE VIEW vw_saldo_conta AS
    SELECT
      c.id AS id,
      c.nome,
      c.tipo_id,
      c.saldo_inicial_centavos
      + COALESCE((SELECT SUM(e.valor_centavos) FROM ent_entradas e WHERE e.conta_corrente_id = c.id),0)
      - COALESCE((SELECT SUM(s.valor_centavos) FROM ent_saidas   s WHERE s.conta_corrente_id = c.id),0)
      - COALESCE((SELECT SUM(t.valor_centavos) FROM ent_transferencias t WHERE t.origem_id  = c.id),0)
      + COALESCE((SELECT SUM(t.valor_centavos) FROM ent_transferencias t WHERE t.destino_id = c.id),0)
      AS saldo_atual_centavos
    FROM ent_contas_corrente c;
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW vw_lancamentos AS
    SELECT
      'entrada' AS tipo,
      numero, id, data_mov, conta_corrente_id, conta_gerencial_id, meio_pagamento_id,
      ref_sessao_caixa_id, funcionario_id, valor_centavos, descricao, documento, criado_em
    FROM ent_entradas
    UNION ALL
    SELECT
      'saida' AS tipo,
      numero, id, data_mov, conta_corrente_id, conta_gerencial_id, meio_pagamento_id,
      ref_sessao_caixa_id, funcionario_id, -valor_centavos, descricao, documento, criado_em
    FROM ent_saidas;
  `);
}

export async function down(knex) {
  await knex.raw(`DROP VIEW IF EXISTS vw_lancamentos;`);
  await knex.raw(`DROP VIEW IF EXISTS vw_saldo_conta;`);
}
