import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

import { PrismaService } from './database/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Prisma migration guard: Check if 'example' column exists in 'Mistake' table
  const prismaService = app.get(PrismaService);
  try {
    await prismaService.$executeRaw`SELECT "example" FROM "Mistake" LIMIT 1`;
  } catch (error) {
    console.error(
      "CRITICAL: Prisma migration has not been applied! The 'Mistake' table is missing the 'example' column.",
    );
    console.error(
      "Please run 'npx prisma migrate deploy' before starting the server.",
    );
    process.exit(1);
  }

  app.useGlobalFilters(new AllExceptionsFilter());

  // Increase payload limit for audio uploads (base64 audio can be large)
  app.use(
    json({
      limit: '50mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(
    urlencoded({
      limit: '50mb',
      extended: true,
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for mobile app integration
  app.enableCors({
    origin: process.env.FRONTEND_URL || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('EngR App API')
    .setDescription('Language Learning Application API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
