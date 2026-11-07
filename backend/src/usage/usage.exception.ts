import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';

export interface Remedy {
  type: 'purchase' | 'upgrade' | 'raise_cap' | 'add_payment_method' | 'contact';
  label: string;
  /** Purchase key (see PURCHASABLES) or plan key, so the client can act on it directly. */
  target?: string;
  priceUsd?: number;
  grants?: number;
}

export interface LimitDetails {
  metric: string;
  remaining?: number | null;
  resetsAt?: string | null;
  remedies: Remedy[];
}

/**
 * A limit error (spec §8.2): carries the metric, what is left, when it resets and what would
 * resolve it. `HttpExceptionFilter` passes `details` through untouched.
 */
export class UsageLimitException extends AppException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus,
    readonly details: LimitDetails,
  ) {
    super(code, message, status);
    const res = this.getResponse() as Record<string, unknown>;
    res.details = details;
  }
}
