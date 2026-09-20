import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { PoliciesService } from './policies.service';

/** Fields that reveal what a product costs the business, or what stock is worth at cost. */
const COST_KEYS = new Set(['costPrice', 'unitCost', 'stockValue', 'cost']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

export function stripCost(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCost);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!COST_KEYS.has(k)) out[k] = stripCost(v);
  }
  return out;
}

/**
 * Enforces the "hide cost from staff" policy on the Products and Inventory APIs: when the owner
 * has it on, anyone without the products.view_cost capability gets responses with the cost fields
 * removed (not blanked to zero, so a missing figure is never mistaken for a real one).
 */
@Injectable()
export class CostVisibilityInterceptor implements NestInterceptor {
  constructor(private readonly policies: PoliciesService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(mergeMap(async (data: unknown) => ((await this.policies.costHidden()) ? stripCost(data) : data)));
  }
}
