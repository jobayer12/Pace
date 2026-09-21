import * as dotenv from 'dotenv';
import type { Knex } from 'knex';
import { buildKnexConfig } from './src/database/database.config';

dotenv.config();

const config: Knex.Config = buildKnexConfig();

export default config;
