/** Movements: entradas, saídas, transferências */
export async function up(knex) {
  // ENTRADAS
  await knex.schema.createTable('ent_entradas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero'); // auto incremental human readable
    t.date('data_mov').notNullable();
    t.uuid('conta_corrente_id').notNullable().references('id').inTable('ent_contas_corrente');
    t.uuid('conta_gerencial_id').notNullable().references('id').inTable('ent_contas_gerenciais');
    t.integer('meio_pagamento_id').notNullable().references('id').inTable('ref_meio_pagamento');
    t.integer('ref_sessao_caixa_id').references('id').inTable('ref_sessao_caixa');
    t.uuid('funcionario_id').references('id').inTable('ent_funcionarios');
    t.bigint('valor_centavos').notNullable();
    t.text('descricao');
    t.text('documento');
    t.uuid('criado_por_id').references('id').inTable('ent_usuarios');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['data_mov']);
    t.index(['conta_corrente_id']);
    t.index(['conta_gerencial_id']);
  });

  // SAIDAS
  await knex.schema.createTable('ent_saidas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero');
    t.date('data_mov').notNullable();
    t.uuid('conta_corrente_id').notNullable().references('id').inTable('ent_contas_corrente');
    t.uuid('conta_gerencial_id').notNullable().references('id').inTable('ent_contas_gerenciais');
    t.integer('meio_pagamento_id').notNullable().references('id').inTable('ref_meio_pagamento');
    t.integer('ref_sessao_caixa_id').references('id').inTable('ref_sessao_caixa');
    t.uuid('funcionario_id').references('id').inTable('ent_funcionarios');
    t.bigint('valor_centavos').notNullable();
    t.text('destinatario');
    t.text('descricao');
    t.text('documento');
    t.uuid('criado_por_id').references('id').inTable('ent_usuarios');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['data_mov']);
    t.index(['conta_corrente_id']);
    t.index(['conta_gerencial_id']);
  });

  // TRANSFERENCIAS
  await knex.schema.createTable('ent_transferencias', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero');
    t.date('data_mov').notNullable();
    t.uuid('origem_id').notNullable().references('id').inTable('ent_contas_corrente');
    t.uuid('destino_id').notNullable().references('id').inTable('ent_contas_corrente');
    t.integer('meio_pagamento_id').references('id').inTable('ref_meio_pagamento');
    t.bigint('valor_centavos').notNullable();
    t.text('descricao');
    t.uuid('criado_por_id').references('id').inTable('ent_usuarios');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check('origem_id <> destino_id');
    t.index(['data_mov']);
    t.index(['origem_id']);
    t.index(['destino_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ent_transferencias');
  await knex.schema.dropTableIfExists('ent_saidas');
  await knex.schema.dropTableIfExists('ent_entradas');
}
