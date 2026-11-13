import { createHash } from 'crypto';

export function voiceSoftphoneIdentity(businessId: string, profileId: string) {
  const digest = createHash('sha256')
    .update(`${businessId}:${profileId}`)
    .digest('hex')
    .slice(0, 40);
  return `nx_${digest}`;
}

/** Twilio settings the browser softphone (Agent Workspace) needs. */
export function softphoneConfigured(get: (key: string) => string | undefined) {
  return Boolean(
    get('TWILIO_ACCOUNT_SID') &&
    get('TWILIO_AUTH_TOKEN') &&
    get('TWILIO_API_KEY_SID') &&
    get('TWILIO_API_KEY_SECRET') &&
    get('TWILIO_TWIML_APP_SID'),
  );
}

/**
 * Where a human agent's call is sent. The Agent Workspace (browser) is the default: it is the
 * cheaper call path (no second outbound leg) and keeps the customer record beside the call.
 * The agent's own phone is used only when the browser softphone isn't set up on the server.
 */
export function agentDialTarget(
  agentPhone: string | null | undefined,
  businessId: string,
  profileId: string,
  softphoneReady: boolean,
): string {
  return softphoneReady || !agentPhone
    ? `client:${voiceSoftphoneIdentity(businessId, profileId)}`
    : agentPhone;
}
