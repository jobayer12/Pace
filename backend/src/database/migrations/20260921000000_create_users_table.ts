import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id').primary();

    // A unique constraint is backed by a btree index in Postgres, so this
    // covers both the uniqueness requirement and lookups by email.
    table.string('email', 255).notNullable().unique({ indexName: 'users_email_unique' });

    table.string('first_name', 255).notNullable();
    table.string('last_name', 255).notNullable();

    // timestamptz stores an absolute instant; Postgres normalises it to UTC on
    // write regardless of the session/server timezone. Do NOT use
    // `now() AT TIME ZONE 'utc'` here: that yields a naive timestamp which is
    // then re-interpreted in the server timezone, shifting the value.
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
