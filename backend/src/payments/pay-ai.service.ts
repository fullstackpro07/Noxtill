import { Injectable, Logger } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';

/**
 * AI in Payments only drafts wording from facts already in Noxtill. It never moves money, never
 * changes an amount, never marks anything paid/refunded/submitted and never invents evidence.
 * When AI is off or unavailable the draft is built from the same facts and labelled as such.
 */
@Injectable()
export class PayAiService {
  private readonly logger = new Logger(PayAiService.name);

  constructor(private readonly ai: AiInfraService) {}

  async draft(
    businessId: string,
    purpose: string,
    facts: string[],
    fallback: string,
  ): Promise<{ text: string; source: 'AI' | 'Facts template' }> {
    const prompt = [
      `You write a short, polite message for a business. Purpose: ${purpose}.`,
      'Use ONLY these facts; do not add amounts, dates, promises, discounts or reasons that are not listed.',
      'Never ask for card numbers, CVV or passwords. Keep it under 70 words. Output only the message text.',
      'Facts:',
      ...facts.map((f) => `- ${f}`),
    ].join('\n');
    try {
      const text = (
        await this.ai.complete(businessId, prompt, 0.2, 'payments_draft')
      ).trim();
      if (text) return { text, source: 'AI' };
    } catch (e) {
      this.logger.debug(
        `payments AI draft unavailable: ${(e as Error).message}`,
      );
    }
    return { text: fallback, source: 'Facts template' };
  }

  async disputeDraft(
    businessId: string,
    facts: string[],
  ): Promise<{ text: string; source: 'AI' | 'Facts template' }> {
    const fallback = [
      'We are responding to this dispute with the following records from our system:',
      ...facts.map((f) => `• ${f}`),
    ].join('\n');
    const prompt = [
      'Draft a factual chargeback dispute response for the card issuer.',
      'Use ONLY the evidence facts below. Do not claim any document, delivery, signature or conversation that is not listed.',
      'If evidence is missing, do not mention it as present. Plain text, under 180 words.',
      'Evidence facts:',
      ...facts.map((f) => `- ${f}`),
    ].join('\n');
    try {
      const text = (
        await this.ai.complete(businessId, prompt, 0.1, 'payments_draft')
      ).trim();
      if (text) return { text, source: 'AI' };
    } catch (e) {
      this.logger.debug(
        `payments AI dispute draft unavailable: ${(e as Error).message}`,
      );
    }
    return { text: fallback, source: 'Facts template' };
  }
}
