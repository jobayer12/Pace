import 'reflect-metadata';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { isSwaggerEnabled, setupSwagger, SWAGGER_PATH } from './swagger/swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);

  const swaggerEnabled = isSwaggerEnabled();
  if (swaggerEnabled) {
    setupSwagger(app, port);
  }

  await app.listen(port);
  Logger.log(`Application listening on http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Metrics exposed at http://localhost:${port}/metrics`, 'Bootstrap');
  if (swaggerEnabled) {
    Logger.log(`Swagger UI at http://localhost:${port}/${SWAGGER_PATH}`, 'Bootstrap');
  }
}

void bootstrap();
