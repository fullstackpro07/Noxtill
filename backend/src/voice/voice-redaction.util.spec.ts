import { redactText } from './voice-redaction.util';

describe('redactText', () => {
  it('masks cards (Luhn), ids, phones and emails but keeps times, prices and short numbers', () => {
    const { text, count } = redactText(
      'Card 4242 4242 4242 4242, SSN 123-45-6789, call me on +1 (415) 555-0100 or jo.doe@example.com. ' +
        'Booking at 10:30 for $45.00, order 12345, table 7.',
    );
    expect(text).toBe(
      'Card [card number], SSN [id number], call me on [phone number] or [email]. ' +
        'Booking at 10:30 for $45.00, order 12345, table 7.',
    );
    expect(count).toBe(4);
  });

  it('treats a 16-digit run that fails Luhn as a phone-like number, not a card', () => {
    expect(redactText('ref 4242 4242 4242 4241').text).toBe(
      'ref [phone number]',
    );
  });

  it('returns unchanged text with zero count when nothing sensitive is present', () => {
    expect(redactText('Can I book a haircut tomorrow?')).toEqual({
      text: 'Can I book a haircut tomorrow?',
      count: 0,
    });
  });
});
