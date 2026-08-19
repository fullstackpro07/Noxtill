export const API_KEY_PREFIX = 'ntk_';
/** Raw random bytes in the generated secret — 24 bytes -> 48 hex chars, plenty of entropy. */
export const API_KEY_SECRET_BYTES = 24;
/** How much of the raw key is kept (hashed key aside) for the key-list UI to identify a row. */
export const API_KEY_VISIBLE_PREFIX_LENGTH = 12;
