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
      // Must come before the output format, otherwise an Error logged as the
      // message serialises to `{}` and the stack is lost.
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      isProduction
        ? // Structured single-line JSON: what a log shipper can parse.
          winston.format.json()
        : // Human-readable, colourised, Nest-style output for local work.
          nestWinstonUtilities.format.nestLike(env.SERVICE_NAME ?? 'backend', {
            colors: true,
            prettyPrint: true,
          }),
    ),
    // Only in production: the JSON output needs the field for filtering, but
    // in the pretty dev format it just repeats on every line as noise.
    defaultMeta: isProduction ? { service: env.SERVICE_NAME ?? 'backend' } : undefined,
    transports: [new winston.transports.Console()],
  };
};
