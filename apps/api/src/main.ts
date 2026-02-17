import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  // Cookie parsing (for session tokens)
  app.use(cookieParser());

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Zod Validation
  app.useGlobalPipes(new ZodValidationPipe());

  // Swagger Config (Required for Scalar to ingest)
  const config = new DocumentBuilder()
    .setTitle('Apotheca API')
    .setDescription('Household medicine inventory API')
    .setVersion('1.0')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);

  // Mount Scalar UI at /reference
  app.use(
    '/reference',
    apiReference({
      content: document,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`API Reference: ${await app.getUrl()}/reference`);
}
bootstrap();
