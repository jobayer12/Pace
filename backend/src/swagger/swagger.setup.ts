import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

/** `SWAGGER_ENABLED=false` turns the docs off; anything else leaves them on. */
export const isSwaggerEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.SWAGGER_ENABLED !== 'false';

export const setupSwagger = (app: INestApplication, port: number): void => {
  const config = new DocumentBuilder()
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
    .addServer(`http://localhost:${port}`, 'Local')
    .addTag('users', 'User records')
    .addTag('metrics', 'Prometheus scrape endpoint')
    .build();

  const document = SwaggerModule.createDocument(app, config);

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
