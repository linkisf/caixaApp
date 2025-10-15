// backend/migrations/20250924_create_funcoes_and_fk.js
export async function up(knex) {
  await knex.schema.createTable('funcoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nome').notNullable().unique();
    t.text('descricao');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('modificado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  const hasCol = await knex.schema.hasColumn('funcionarios', 'funcao_id');
  if (!hasCol) {
    await knex.schema.alterTable('funcionarios', (t) => {
      t.uuid('funcao_id')
        .references('id')
        .inTable('funcoes')
        .onUpdate('CASCADE')
        .onDelete('SET NULL')
        .index();
    });
  }
}

export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('funcionarios', 'funcao_id');
  if (hasCol) {
    await knex.schema.alterTable('funcionarios', (t) => t.dropColumn('funcao_id'));
  }
  await knex.schema.dropTableIfExists('funcoes');
}
