const CONTACT_KEYS = new Set(['phone', 'email', 'phoneNumber', 'customerPhone', 'customerEmail']);

function mask(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return digits.length > 4 ? `•••${digits.slice(-4)}` : '•••';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

/** Masks phone/email values anywhere in a tool result so the model never sees a real contact. */
export function maskContacts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskContacts);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = CONTACT_KEYS.has(k) && typeof v === 'string' ? mask(v) : maskContacts(v);
  }
  return out;
}
