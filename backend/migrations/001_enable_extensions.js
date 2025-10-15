/** Enable required extensions */
export async function up(knex) {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
}

export async function down(knex) {
  // usually we don't drop extensions on down; keep it idempotent
}
