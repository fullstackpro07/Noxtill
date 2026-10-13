import { ConfigService } from '@nestjs/config';

/**
 * A ConfigService that only knows `values`. A plain `new ConfigService({})` still falls back to
 * `process.env`, so a spec simulating "Twilio not configured" breaks on any machine whose `.env`
 * has real credentials.
 */
export function isolatedConfig(
  values: Record<string, unknown> = {},
): ConfigService {
  const config = new ConfigService(values);
  (config as unknown as { skipProcessEnv: boolean }).skipProcessEnv = true;
  return config;
}
