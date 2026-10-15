import { createHash } from 'crypto';

export function voiceSoftphoneIdentity(businessId: string, profileId: string) {
  const digest = createHash('sha256')
    .update(`${businessId}:${profileId}`)
    .digest('hex')
    .slice(0, 40);
  return `nx_${digest}`;
}
