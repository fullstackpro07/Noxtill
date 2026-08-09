import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

const MIN_SECRET_LENGTH = 22; // spec §6
const PLACEHOLDER_SECRETS = new Set(['your-secret', 'your-refresh-secret']);

/**
 * Boot-time guard for the app's own auth secrets (spec §6 — tokens ≥22 chars). Every other
 * missing credential this project has ever needed (Stripe, Google, Meta, TikTok, Anthropic...)
 * is fine to only fail at the moment a caller reaches that specific feature — but a weak/missing
 * JWT secret silently signs every session in the app, so it gets the one deliberate NODE_ENV
 * branch in this file: warn in dev, refuse to boot in production.
 */
function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';

  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = process.env[name];
    const problem = !value
      ? 'is not set'
      : PLACEHOLDER_SECRETS.has(value)
        ? 'is still the dev placeholder value'
        : value.length < MIN_SECRET_LENGTH
          ? `is only ${value.length} chars (spec §6 requires ≥${MIN_SECRET_LENGTH})`
          : null;

    if (!problem) continue;
    const message = `${name} ${problem} — refusing to sign real sessions with a weak secret.`;
    if (isProd) {
      throw new Error(message);
    }
    console.warn(`⚠️  ${message}`);
  }
}

async function bootstrap() {
  validateEnv();

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
