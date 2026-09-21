import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import knex, { Knex } from 'knex';
import { buildKnexConfig } from './database.config';
import { KNEX_CONNECTION } from './knex.constants';

@Global()
@Module({
  providers: [
    {
      provide: KNEX_CONNECTION,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Knex> => {
        const connection = knex(
          buildKnexConfig({
            DB_HOST: config.get<string>('DB_HOST'),
            DB_PORT: config.get<string>('DB_PORT'),
            DB_USER: config.get<string>('DB_USER'),
            DB_PASSWORD: config.get<string>('DB_PASSWORD'),
            DB_NAME: config.get<string>('DB_NAME'),
            DB_POOL_MIN: config.get<string>('DB_POOL_MIN'),
            DB_POOL_MAX: config.get<string>('DB_POOL_MAX'),
          } as NodeJS.ProcessEnv),
        );

        await connection.raw('select 1');
        Logger.log('PostgreSQL connection established', 'DatabaseModule');

        return connection;
      },
    },
  ],
  exports: [KNEX_CONNECTION],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const connection = this.moduleRef.get<Knex>(KNEX_CONNECTION);
    await connection.destroy();
  }
}
