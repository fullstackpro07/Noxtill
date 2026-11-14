import { SetMetadata } from '@nestjs/common';

export const REQUIRE_STEP_UP_KEY = 'requireStepUp';

/**
 * Elevated action (auth security spec §8.5: billing, payroll, export): the browser session must
 * have re-authenticated (password, authenticator code or passkey) within the last 10 minutes.
 * Enforced by the global auth guard; developer API keys are not session-based and are unaffected.
 */
export const RequireStepUp = () => SetMetadata(REQUIRE_STEP_UP_KEY, true);
