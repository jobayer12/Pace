declare module 'knexnest' {
  import type { Knex } from 'knex';

  function knexnest<T>(query: Knex.QueryBuilder, listOnEmpty: true): Promise<T[]>;
  function knexnest<T>(query: Knex.QueryBuilder, listOnEmpty?: false): Promise<T[] | null>;

  export = knexnest;
}
