//   /$$$$$$   /$$$$$$  /$$$$$$$  /$$       /$$$$$$ /$$   /$$ /$$$$$$$$
//  /$$__  $$ /$$__  $$| $$__  $$| $$      |_  $$_/| $$$ | $$| $$_____/
// | $$  \__/| $$  \ $$| $$  \ $$| $$        | $$  | $$$$| $$| $$
// | $$      | $$$$$$$$| $$$$$$$/| $$        | $$  | $$ $$ $$| $$$$$
// | $$      | $$__  $$| $$__  $$| $$        | $$  | $$  $$$$| $$__/
// | $$    $$| $$  | $$| $$  \ $$| $$        | $$  | $$\  $$$| $$
// |  $$$$$$/| $$  | $$| $$  | $$| $$$$$$$$ /$$$$$$| $$ \  $$| $$$$$$$$
//  \______/ |__/  |__/|__/  |__/|________/|______/|__/  \__/|________/

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import morgan from 'morgan';
import * as express from 'express';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';

import constants from './constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { RequestLoggerMiddleware } from './common/middlewares/request-logger.middleware';
import { RateLimiterMiddleware } from './common/middlewares/rate-limiter.middleware';

const { SWAGGER, Global } = constants;
const logger = new Logger('Bootstrap');

// Catch uncaught exceptions globally to prevent silent Node process aborts
process.on('uncaughtException', (err: Error) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'FATAL',
      type: 'UNCAUGHT_EXCEPTION',
      error: err?.message,
      stack: err?.stack,
    }),
  );
});

// Catch unhandled promise rejections globally
process.on('unhandledRejection', (reason: any) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'UNHANDLED_REJECTION',
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    }),
  );
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Body parser payload limits to prevent OOM DOS attacks
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // In-memory sliding window rate limiting to guard downstream services
  const rateLimiter = new RateLimiterMiddleware();
  app.use((req: any, res: any, next: any) => rateLimiter.use(req, res, next));

  // Structured JSON access logging with X-Request-Id correlation
  const requestLogger = new RequestLoggerMiddleware();
  app.use((req: any, res: any, next: any) => requestLogger.use(req, res, next));

  // Morgan for concise terminal dev logging
  app.use(morgan('dev'));

  // Serve uploaded files statically
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: `${Global.PREFIX}/uploads`,
  });

  // Global exception handling & sanitized JSON responses
  app.useGlobalFilters(new AllExceptionsFilter());

  // 30s timeout guard to prevent socket and connection leaks under load
  app.useGlobalInterceptors(new TimeoutInterceptor(30000));

  // Enable global validation for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // WebSocket Adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global Prefix
  app.setGlobalPrefix(Global.PREFIX);

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle(SWAGGER.TITLE)
    .setDescription(SWAGGER.DESCRIPTION)
    .setVersion(SWAGGER.VERSION)
    .addServer(process.env.BASE_URL || SWAGGER.SERVER_URL || '/')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${Global.PREFIX}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4010;
  const server: any = await app.listen(port);

  // HTTP Keep-Alive tuning for reverse proxies (Nginx / ALB) to prevent 502 Bad Gateways
  if (server && typeof server.keepAliveTimeout !== 'undefined') {
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  }

  logger.log(`🚀 Carline server is running on port ${port}`);
}

bootstrap();
