/**
 * Transcript redaction rules. Order matters: card numbers (Luhn-checked) before SSNs before
 * phone numbers, so a long digit run is classified once. Emails are independent.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const DIGIT_RUN = /\+?\d[\d\s().-]{6,}\d/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redactText(input: string): { text: string; count: number } {
  let count = 0;
  let text = input.replace(EMAIL, () => {
    count += 1;
    return '[email]';
  });
  text = text.replace(SSN, () => {
    count += 1;
    return '[id number]';
  });
  text = text.replace(DIGIT_RUN, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      count += 1;
      return '[card number]';
    }
    if (digits.length >= 9) {
      count += 1;
      return '[phone number]';
    }
    return match;
  });
  return { text, count };
}
