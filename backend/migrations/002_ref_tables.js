/** Reference tables with integer PKs (id serial), name and description */
export async function up(knex) {
  await knex.schema.createTable('ref_papel', (t) => {
    t.increments('id').primary();
    t.text('nome').notNullable().unique();
    t.text('descricao');
  });

  await knex.schema.createTable('ref_tipo_conta_corrente', (t) => {
    t.increments('id').primary();
    t.text('nome').notNullable().unique();
    t.text('descricao');
  });

  await knex.schema.createTable('ref_tipo_conta_gerencial', (t) => {
    t.increments('id').primary();
    t.text('nome').notNullable().unique();
    t.text('descricao');
  });

  await knex.schema.createTable('ref_meio_pagamento', (t) => {
    t.increments('id').primary();
    t.text('nome').notNullable().unique();
    t.text('descricao');
  });

  await knex.schema.createTable('ref_sessao_caixa', (t) => {
    t.increments('id').primary();
    t.text('nome').notNullable().unique();
    t.text('descricao');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ref_sessao_caixa');
  await knex.schema.dropTableIfExists('ref_meio_pagamento');
  await knex.schema.dropTableIfExists('ref_tipo_conta_gerencial');
  await knex.schema.dropTableIfExists('ref_tipo_conta_corrente');
  await knex.schema.dropTableIfExists('ref_papel');
}
