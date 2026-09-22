import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

export const isSwaggerEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.SWAGGER_ENABLED !== 'false';

/**
 * Servers offered in the Swagger UI dropdown, in order. The relative entry comes
 * first so "Try it out" resolves against whatever origin serves the page, which
 * works on localhost and behind a tunnel without cross-origin or mixed-content
 * blocks. PUBLIC_URL pins an absolute production URL (comma-separated for
 * several); the localhost entry is only offered when the app is not in
 * production, so deployed docs never point back at a developer machine.
 */
export const resolveServers = (
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): Array<{ url: string; description: string }> => {
  const servers = [{ url: '/', description: 'Same origin' }];

  for (const url of (env.PUBLIC_URL ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean)) {
    servers.push({ url, description: 'Public' });
  }

  if (env.NODE_ENV !== 'production') {
    servers.push({ url: `http://localhost:${port}`, description: 'Local' });
  }

  return servers;
};

export const setupSwagger = (app: INestApplication, port: number): void => {
  const builder = new DocumentBuilder()
    .setTitle('Backend API')
    .setDescription(
      [
        'NestJS + PostgreSQL + Knex backend.',
        '',
        'Note that `User.id` is a **string**: the column is a `bigint`, whose range',
        'exceeds `Number.MAX_SAFE_INTEGER`, so parsing it as a JSON number would',
        'silently corrupt large ids.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addTag('users', 'User records')
    .addTag('metrics', 'Prometheus scrape endpoint');

  for (const server of resolveServers(port)) {
    builder.addServer(server.url, server.description);
  }

  const document = SwaggerModule.createDocument(app, builder.build());

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    yamlDocumentUrl: `${SWAGGER_PATH}/yaml`,
    swaggerOptions: {
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });
};
