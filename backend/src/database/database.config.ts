import type { Knex } from 'knex';

export const buildKnexConfig = (env: NodeJS.ProcessEnv = process.env): Knex.Config => ({
  client: 'pg',
  connection: {
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USER ?? 'postgres',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME ?? 'postgres',
  },
  pool: {
    min: Number(env.DB_POOL_MIN ?? 2),
    max: Number(env.DB_POOL_MAX ?? 10),
  },
  migrations: {
    directory: `${__dirname}/migrations`,
    extension: 'ts',
    tableName: 'knex_migrations',
  },
});
