/**
 * Development switch: `AUTH_SKIP_EMAIL_VERIFICATION=true` treats every account as email-confirmed
 * (signup goes straight to onboarding, no confirmation email is sent). Never set it in production.
 */
export function emailVerificationSkipped(): boolean {
  return (
    process.env.AUTH_SKIP_EMAIL_VERIFICATION === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}
