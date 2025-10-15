/** Aggregated balance table + triggers for incremental updates */
export async function up(knex) {
  await knex.schema.createTable('agg_conta_saldo', (t) => {
    t.uuid('conta_id').primary().references('id').inTable('ent_contas_corrente');
    t.bigint('saldo_centavos').notNullable();
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION fn_aplica_delta_saldo(p_conta UUID, p_delta BIGINT)
    RETURNS VOID AS $$
    BEGIN
      INSERT INTO agg_conta_saldo (conta_id, saldo_centavos, atualizado_em)
      VALUES (p_conta, p_delta, NOW())
      ON CONFLICT (conta_id)
      DO UPDATE SET saldo_centavos = agg_conta_saldo.saldo_centavos + EXCLUDED.saldo_centavos,
                    atualizado_em  = NOW();
    END;
    $$ LANGUAGE plpgsql;
  `);

  // entradas trigger
  await knex.raw(`
    CREATE OR REPLACE FUNCTION tg_entradas_agg() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        PERFORM fn_aplica_delta_saldo(NEW.conta_corrente_id,  NEW.valor_centavos);
      ELSIF TG_OP = 'DELETE' THEN
        PERFORM fn_aplica_delta_saldo(OLD.conta_corrente_id, -OLD.valor_centavos);
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.conta_corrente_id = OLD.conta_corrente_id THEN
          PERFORM fn_aplica_delta_saldo(NEW.conta_corrente_id, NEW.valor_centavos - OLD.valor_centavos);
        ELSE
          PERFORM fn_aplica_delta_saldo(OLD.conta_corrente_id, -OLD.valor_centavos);
          PERFORM fn_aplica_delta_saldo(NEW.conta_corrente_id,  NEW.valor_centavos);
        END IF;
      END IF;
      RETURN NULL;
    END; $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`DROP TRIGGER IF EXISTS tr_entradas_agg ON ent_entradas;`);
  await knex.raw(`CREATE TRIGGER tr_entradas_agg
    AFTER INSERT OR UPDATE OR DELETE ON ent_entradas
    FOR EACH ROW EXECUTE FUNCTION tg_entradas_agg();`);

  // saidas trigger
  await knex.raw(`
    CREATE OR REPLACE FUNCTION tg_saidas_agg() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        PERFORM fn_aplica_delta_saldo(NEW.conta_corrente_id, -NEW.valor_centavos);
      ELSIF TG_OP = 'DELETE' THEN
        PERFORM fn_aplica_delta_saldo(OLD.conta_corrente_id,  OLD.valor_centavos);
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.conta_corrente_id = OLD.conta_corrente_id THEN
          PERFORM fn_aplica_delta_saldo(NEW.conta_corrente_id, -(NEW.valor_centavos - OLD.valor_centavos));
        ELSE
          PERFORM fn_aplica_delta_saldo(OLD.conta_corrente_id,  OLD.valor_centavos);
          PERFORM fn_aplica_delta_saldo(NEW.conta_corrente_id, -NEW.valor_centavos);
        END IF;
      END IF;
      RETURN NULL;
    END; $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`DROP TRIGGER IF EXISTS tr_saidas_agg ON ent_saidas;`);
  await knex.raw(`CREATE TRIGGER tr_saidas_agg
    AFTER INSERT OR UPDATE OR DELETE ON ent_saidas
    FOR EACH ROW EXECUTE FUNCTION tg_saidas_agg();`);

  // transferencias trigger
  await knex.raw(`
    CREATE OR REPLACE FUNCTION tg_transf_agg() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        PERFORM fn_aplica_delta_saldo(NEW.origem_id,  -NEW.valor_centavos);
        PERFORM fn_aplica_delta_saldo(NEW.destino_id,  NEW.valor_centavos);
      ELSIF TG_OP = 'DELETE' THEN
        PERFORM fn_aplica_delta_saldo(OLD.origem_id,   OLD.valor_centavos);
        PERFORM fn_aplica_delta_saldo(OLD.destino_id, -OLD.valor_centavos);
      ELSIF TG_OP = 'UPDATE' THEN
        PERFORM fn_aplica_delta_saldo(OLD.origem_id,   OLD.valor_centavos);
        PERFORM fn_aplica_delta_saldo(OLD.destino_id, -OLD.valor_centavos);
        PERFORM fn_aplica_delta_saldo(NEW.origem_id,  -NEW.valor_centavos);
        PERFORM fn_aplica_delta_saldo(NEW.destino_id,  NEW.valor_centavos);
      END IF;
      RETURN NULL;
    END; $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`DROP TRIGGER IF EXISTS tr_transf_agg ON ent_transferencias;`);
  await knex.raw(`CREATE TRIGGER tr_transf_agg
    AFTER INSERT OR UPDATE OR DELETE ON ent_transferencias
    FOR EACH ROW EXECUTE FUNCTION tg_transf_agg();`);
}

export async function down(knex) {
  await knex.raw(`DROP TRIGGER IF EXISTS tr_transf_agg ON ent_transferencias;`);
  await knex.raw(`DROP TRIGGER IF EXISTS tr_saidas_agg ON ent_saidas;`);
  await knex.raw(`DROP TRIGGER IF EXISTS tr_entradas_agg ON ent_entradas;`);
  await knex.raw(`DROP FUNCTION IF EXISTS tg_transf_agg();`);
  await knex.raw(`DROP FUNCTION IF EXISTS tg_saidas_agg();`);
  await knex.raw(`DROP FUNCTION IF EXISTS tg_entradas_agg();`);
  await knex.raw(`DROP FUNCTION IF EXISTS fn_aplica_delta_saldo(UUID, BIGINT);`);
  await knex.schema.dropTableIfExists('agg_conta_saldo');
}
