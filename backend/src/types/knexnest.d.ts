declare module 'knexnest' {
  import type { Knex } from 'knex';

  /**
   * Runs a Knex select and hydrates the flat rows into objects, using the
   * column aliases to describe the shape (see UsersRepository for the alias
   * convention).
   *
   * The aliases we use are all `_`-prefixed, which makes the root a list; the
   * overloads below reflect that. (With un-prefixed aliases knexnest returns a
   * single object instead, which we never rely on.)
   *
   * `listOnEmpty` matters: without it an empty result set resolves to `null`
   * rather than `[]`.
   */
  function knexnest<T>(query: Knex.QueryBuilder, listOnEmpty: true): Promise<T[]>;
  function knexnest<T>(query: Knex.QueryBuilder, listOnEmpty?: false): Promise<T[] | null>;

  export = knexnest;
}
