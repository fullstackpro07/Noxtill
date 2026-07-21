import { randomBytes } from 'crypto';

/** Lowercase, hyphenated slug with a short random suffix to avoid collisions. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = randomBytes(3).toString('hex');
  return `${base || 'business'}-${suffix}`;
}
