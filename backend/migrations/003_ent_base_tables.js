/** Base entities with UUID PKs */
export async function up(knex) {
  await knex.schema.createTable('ent_usuarios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nome').notNullable();
    t.text('email').notNullable().unique();
    t.integer('papel_id').notNullable().references('id').inTable('ref_papel');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ent_funcionarios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nome').notNullable();
    t.text('documento');
    t.text('cargo');
    t.text('email');
    t.text('telefone');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ent_contas_corrente', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nome').notNullable();
    t.integer('tipo_id').notNullable().references('id').inTable('ref_tipo_conta_corrente');
    t.text('banco');
    t.text('agencia');
    t.text('numero');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.bigint('saldo_inicial_centavos').notNullable().defaultTo(0);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ent_dre_classificacao', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('codigo').notNullable().unique();
    t.text('nome').notNullable();
    t.text('natureza').notNullable();
    t.integer('ordem').notNullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ent_contas_gerenciais', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('codigo').notNullable().unique();
    t.text('nome').notNullable();
    t.integer('tipo_id').notNullable().references('id').inTable('ref_tipo_conta_gerencial');
    t.uuid('dre_classificacao_id').notNullable().references('id').inTable('ent_dre_classificacao');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ent_contas_gerenciais');
  await knex.schema.dropTableIfExists('ent_dre_classificacao');
  await knex.schema.dropTableIfExists('ent_contas_corrente');
  await knex.schema.dropTableIfExists('ent_funcionarios');
  await knex.schema.dropTableIfExists('ent_usuarios');
}
