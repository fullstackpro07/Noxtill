import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { ResolvedPolicies } from '../common/policies/policies.service';
import { ORDER_ERROR_CODES } from './orders.constants';

/** Asks whether the person ringing up the sale holds a capability (owner always does). */
export type ActorCan = (capability: string) => Promise<boolean>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SalePolicyInput {
  hasCustomer: boolean;
  /** Lines that carry a price different from the catalogue price. */
  overriddenPriceNames: string[];
  /** The hand-entered discount, not counting coupons the owner configured. */
  manualDiscount: number;
  rawSubtotal: number;
}

/** Owner-set sale rules that don't depend on stock or credit: customer, price override, discount. */
export async function enforceSaleRules(policies: ResolvedPolicies, input: SalePolicyInput, actorCan: ActorCan): Promise<void> {
  if (policies.bool('sales.requireCustomer') && !input.hasCustomer) {
    throw new AppException(ORDER_ERROR_CODES.CUSTOMER_REQUIRED, 'This business requires a customer on every sale', HttpStatus.BAD_REQUEST);
  }
  if (policies.bool('sales.restrictPriceOverride') && input.overriddenPriceNames.length > 0) {
    if (!(await actorCan(CAPABILITIES.PRICE_OVERRIDE))) {
      throw new AppException(
        ORDER_ERROR_CODES.PRICE_OVERRIDE_RESTRICTED,
        `You are not allowed to change the price of "${input.overriddenPriceNames[0]}"`,
        HttpStatus.FORBIDDEN,
      );
    }
  }
  const max = policies.num('sales.maxDiscountPercent');
  if (max !== null && input.rawSubtotal > 0 && input.manualDiscount > 0) {
    const percent = (input.manualDiscount / input.rawSubtotal) * 100;
    if (percent > max + 1e-9 && !(await actorCan(CAPABILITIES.DISCOUNT_OVERRIDE))) {
      throw new AppException(
        ORDER_ERROR_CODES.DISCOUNT_LIMIT_EXCEEDED,
        `Discounts are limited to ${max}% (this one is ${round2(percent)}%)`,
        HttpStatus.FORBIDDEN,
      );
    }
  }
}

/**
 * A credit sale may not take a customer past their limit — the customer's own limit when set,
 * otherwise the business default. Holders of `credit.limit_override` may step past it.
 */
export async function enforceCreditLimit(
  policies: ResolvedPolicies,
  input: { customerLimit: number | null; balance: number; amountDue: number },
  actorCan: ActorCan,
): Promise<void> {
  const limit = input.customerLimit ?? policies.num('credit.defaultLimit');
  if (limit === null) return;
  const after = round2(input.balance + input.amountDue);
  if (after > limit + 1e-9 && !(await actorCan(CAPABILITIES.CREDIT_LIMIT_OVERRIDE))) {
    throw new AppException(
      ORDER_ERROR_CODES.CREDIT_LIMIT_EXCEEDED,
      `This sale would take the customer to ${after.toFixed(2)} owed, over their credit limit of ${limit.toFixed(2)}`,
      HttpStatus.FORBIDDEN,
    );
  }
}
