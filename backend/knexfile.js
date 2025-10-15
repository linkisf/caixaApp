/**
 * Knex configuration file
 * We use environment variables to configure the DB connection.
 */
import 'dotenv/config';

export default {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'caixaAppDB'
  },
  pool: { min: 0, max: 10 },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations'
  },
  seeds: {
    directory: './seeds'
  }
};
