import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is needed to verify webhook signatures (Meta/Stripe HMAC) against the exact bytes sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());

  const corsAllowlist = (process.env.CORS_ALLOWLIST ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({ origin: corsAllowlist, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
