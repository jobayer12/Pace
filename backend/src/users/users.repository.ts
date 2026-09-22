import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import knexnest from 'knexnest';
import { KNEX_CONNECTION } from '../database/knex.constants';
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
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async findById(id: string): Promise<User | undefined> {
    const [user] = await knexnest<User>(
      this.knex(TABLE).select(...USER_COLUMNS).where({ id }).limit(1),
      true,
    );
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await knexnest<User>(
      this.knex(TABLE).select(...USER_COLUMNS).where({ email }).limit(1),
      true,
    );
    return user;
  }

  async findPage(limit: number, offset: number): Promise<User[]> {
    return knexnest<User>(
      this.knex(TABLE).select(...USER_COLUMNS).orderBy('id', 'asc').limit(limit).offset(offset),
      true,
    );
  }

  async insert(payload: InsertUserRow): Promise<User> {
    const [user] = await knexnest<User>(
      this.knex(TABLE).insert(payload).returning([...USER_COLUMNS]),
      true,
    );
    return user;
  }
}
