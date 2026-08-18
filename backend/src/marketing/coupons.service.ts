import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { COUPON_ERROR_CODES } from './coupons.constants';
import { CouponType, Prisma } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface CouponRow {
  id: string;
  type: CouponType;
  value: Prisma.Decimal;
  minOrderAmount: Prisma.Decimal | null;
  maxDiscountAmount: Prisma.Decimal | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
}

/**
 * Narrow transaction-client shape actually used by `validateAndApply` — same hand-written-subset
 * pattern as `ReferralsService.TxClient` / `LoyaltyService.LoyaltyTxClient`, since `$extends`-wrapped
 * tenant clients aren't nominally assignable to `Prisma.TransactionClient`.
 */
export interface CouponTxClient {
  coupon: {
    findUnique(args: {
      where: { businessId_code: { businessId: string; code: string } };
    }): Promise<CouponRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  order: {
    count(args: {
      where: { couponId: string; customerId: string };
    }): Promise<number>;
  };
}

/** Coupons (UPD-BE-029) — a single discount rule redeemed at sale time via `POST /sales`. */
@Injectable()
export class CouponsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(businessId: string, dto: CreateCouponDto) {
    try {
      return await this.tenantPrisma.client.coupon.create({
        data: {
          businessId,
          code: dto.code,
          type: dto.type,
          value: dto.value,
          minOrderAmount: dto.minOrderAmount,
          maxDiscountAmount: dto.maxDiscountAmount,
          usageLimit: dto.usageLimit,
          usageLimitPerCustomer: dto.usageLimitPerCustomer,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppException(
          COUPON_ERROR_CODES.DUPLICATE_CODE,
          `Coupon code "${dto.code}" already exists`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  list() {
    return this.tenantPrisma.client.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const coupon = await this.tenantPrisma.client.coupon.findUnique({
      where: { id },
    });
    if (!coupon) {
      throw new AppException(
        COUPON_ERROR_CODES.NOT_FOUND,
        'Coupon not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return coupon;
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.coupon.update({
      where: { id },
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.coupon.delete({ where: { id } });
  }

  /**
   * Validates a coupon code against real subtotal/usage-limit rules and increments its usage
   * counter — called from inside `OrdersService.createSale`'s transaction, before
   * `computeOrderTotals`, so the discount it produces feeds into tax/total math like any other
   * discount. Never trusts a client-supplied discount amount — always recomputed here.
   */
  async validateAndApply(
    businessId: string,
    code: string,
    subtotal: number,
    customerId: string | undefined,
    tx: CouponTxClient,
  ): Promise<{ couponId: string; discountAmount: number }> {
    const coupon = await tx.coupon.findUnique({
      where: { businessId_code: { businessId, code } },
    });
    if (!coupon) {
      throw new AppException(
        COUPON_ERROR_CODES.NOT_FOUND,
        `Coupon "${code}" not found`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!coupon.active) {
      throw new AppException(
        COUPON_ERROR_CODES.INACTIVE,
        'Coupon is not active',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new AppException(
        COUPON_ERROR_CODES.NOT_STARTED,
        'Coupon is not active yet',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new AppException(
        COUPON_ERROR_CODES.EXPIRED,
        'Coupon has expired',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
      throw new AppException(
        COUPON_ERROR_CODES.MIN_ORDER_NOT_MET,
        `Order subtotal must be at least ${Number(coupon.minOrderAmount)}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new AppException(
        COUPON_ERROR_CODES.USAGE_LIMIT_REACHED,
        'Coupon usage limit reached',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (coupon.usageLimitPerCustomer !== null) {
      if (!customerId) {
        throw new AppException(
          COUPON_ERROR_CODES.CUSTOMER_USAGE_LIMIT_REACHED,
          'This coupon requires a customer',
          HttpStatus.BAD_REQUEST,
        );
      }
      const usedByCustomer = await tx.order.count({
        where: { couponId: coupon.id, customerId },
      });
      if (usedByCustomer >= coupon.usageLimitPerCustomer) {
        throw new AppException(
          COUPON_ERROR_CODES.CUSTOMER_USAGE_LIMIT_REACHED,
          'You have already used this coupon',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const value = Number(coupon.value);
    let discountAmount =
      coupon.type === CouponType.percentage
        ? round2(subtotal * (value / 100))
        : value;
    if (coupon.maxDiscountAmount !== null) {
      discountAmount = Math.min(
        discountAmount,
        Number(coupon.maxDiscountAmount),
      );
    }
    discountAmount = Math.min(discountAmount, subtotal);

    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    return { couponId: coupon.id, discountAmount };
  }
}
