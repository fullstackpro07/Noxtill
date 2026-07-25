export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  0: "Too weak",
  1: "Weak",
  2: "Okay",
  3: "Strong",
  4: "Very strong",
};

/** Simple, transparent heuristic — no external entropy library needed for this scope. */
export function scorePassword(password: string): PasswordStrength {
  if (!password) return 0;

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  return Math.min(4, score) as PasswordStrength;
}
