import { utilities as nestWinstonUtilities, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

export const buildWinstonOptions = (
  env: NodeJS.ProcessEnv = process.env,
): WinstonModuleOptions => {
  const isProduction = env.NODE_ENV === 'production';

  return {
    level: env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      isProduction
        ? winston.format.json()
        : nestWinstonUtilities.format.nestLike(env.SERVICE_NAME ?? 'backend', {
            colors: true,
            prettyPrint: true,
          }),
    ),
    defaultMeta: isProduction ? { service: env.SERVICE_NAME ?? 'backend' } : undefined,
    transports: [new winston.transports.Console()],
  };
};
