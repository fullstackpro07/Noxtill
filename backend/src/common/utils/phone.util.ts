import {
  parsePhoneNumberWithError,
  type CountryCode,
  isSupportedCountry,
} from 'libphonenumber-js';

/**
 * Normalizes a raw phone number to E.164, using the business's country as
 * the default region when the number has no explicit country code.
 * Returns undefined if the number can't be parsed as valid.
 */
export function normalizePhoneE164(
  raw: string,
  defaultCountry?: string,
): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const region: CountryCode | undefined =
    defaultCountry && isSupportedCountry(defaultCountry)
      ? defaultCountry
      : undefined;

  try {
    const parsed = parsePhoneNumberWithError(trimmed, region);
    return parsed.isValid() ? parsed.number : undefined;
  } catch {
    return undefined;
  }
}
