import { Global, Inject, Logger, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';
import { buildKnexConfig } from './database.config';
import { KNEX_READER, KNEX_WRITER } from './knex.constants';

// Writer and reader share every setting except the port.
const connectionProvider = (token: string, role: 'writer' | 'reader'): Provider => ({
  provide: token,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<Knex> => {
    const writePort = config.get<string>('DB_PORT');
    const port = role === 'writer' ? writePort : config.get<string>('DB_READ_PORT') || writePort;

    const connection = knex(
      buildKnexConfig({
        DB_HOST: config.get<string>('DB_HOST'),
        DB_PORT: port,
        DB_USER: config.get<string>('DB_USER'),
        DB_PASSWORD: config.get<string>('DB_PASSWORD'),
        DB_NAME: config.get<string>('DB_NAME'),
        DB_POOL_MIN: config.get<string>('DB_POOL_MIN'),
        DB_POOL_MAX: config.get<string>('DB_POOL_MAX'),
        DB_QUERY_TIMEOUT_MS: config.get<string>('DB_QUERY_TIMEOUT_MS'),
        DB_ACQUIRE_TIMEOUT_MS: config.get<string>('DB_ACQUIRE_TIMEOUT_MS'),
      } as NodeJS.ProcessEnv),
    );

    await connection.raw('select 1');
    Logger.log(`PostgreSQL ${role} connection established (port ${port ?? 5432})`, 'DatabaseModule');

    return connection;
  },
});

@Global()
@Module({
  providers: [connectionProvider(KNEX_WRITER, 'writer'), connectionProvider(KNEX_READER, 'reader')],
  exports: [KNEX_WRITER, KNEX_READER],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(KNEX_WRITER) private readonly writer: Knex,
    @Inject(KNEX_READER) private readonly reader: Knex,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.writer.destroy(), this.reader.destroy()]);
  }
}
