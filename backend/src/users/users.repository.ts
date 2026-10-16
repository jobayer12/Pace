import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import knexnest from 'knexnest';
import { KNEX_READER, KNEX_WRITER } from '../database/knex.constants';
import { User } from './user.entity';

const TABLE = 'users';

const USER_COLUMNS = [
  'id as _id',
  'email as _email',
  'first_name as _firstName',
  'last_name as _lastName',
  'created_at as _createdAt',
] as const;

export interface InsertUserRow {
  email: string;
  first_name: string;
  last_name: string;
}

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(KNEX_WRITER) private readonly writer: Knex,
    @Inject(KNEX_READER) private readonly reader: Knex,
  ) {}

  async findById(id: string): Promise<User | undefined> {
    const [user] = await knexnest<User>(
      this.reader(TABLE).select(...USER_COLUMNS).where({ id }).limit(1),
      true,
    );
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await knexnest<User>(
      this.reader(TABLE).select(...USER_COLUMNS).where({ email }).limit(1),
      true,
    );
    return user;
  }

  /** Keyset pagination: seeks past afterId on the primary key instead of scanning an offset. */
  async findPageAfter(afterId: number, limit: number): Promise<User[]> {
    const users = await knexnest<User>(
      this.reader(TABLE)
        .select(...USER_COLUMNS)
        .where('id', '>', afterId)
        .orderBy('id', 'asc')
        .limit(limit),
      true,
    );
    return users ?? [];
  }

  async insert(payload: InsertUserRow): Promise<User> {
    const [user] = await knexnest<User>(
      this.writer(TABLE).insert(payload).returning([...USER_COLUMNS]),
      true,
    );
    return user;
  }
}
