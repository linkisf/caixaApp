/** Table for open/close cash sessions */
export async function up(knex) {
  await knex.schema.createTable('sessoes_caixa', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('conta_corrente_id').notNullable().references('id').inTable('ent_contas_corrente');
    t.uuid('aberto_por_id').references('id').inTable('ent_funcionarios');
    t.uuid('fechado_por_id').references('id').inTable('ent_funcionarios');
    t.timestamp('aberto_em', { useTz: true });
    t.timestamp('fechado_em', { useTz: true });
    t.bigint('saldo_abertura_centavos');
    t.bigint('saldo_fechamento_centavos');
    t.text('observacao');
    t.check('fechado_em IS NULL OR fechado_em >= aberto_em');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('sessoes_caixa');
}
