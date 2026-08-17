import { randomBytes } from 'crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { IssueVoucherDto } from './dto/issue-voucher.dto';
import {
  VOUCHER_ERROR_CODES,
  VOUCHER_ISSUED_TEMPLATE_KEY,
} from './vouchers.constants';
import { Prisma, Voucher, VoucherStatus } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function generateVoucherCode(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

interface VoucherRow {
  id: string;
  balance: Prisma.Decimal;
  status: VoucherStatus;
  expiresAt: Date | null;
}

/**
 * Narrow transaction-client shape actually used by `validateAndApply` — same
 * hand-written-subset pattern as `CouponsService.CouponTxClient`.
 */
export interface VoucherTxClient {
  voucher: {
    findUnique(args: {
      where: { businessId_code: { businessId: string; code: string } };
    }): Promise<VoucherRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/**
 * Vouchers (UPD-BE-030) — a store-credit-style balance, unlike a Coupon's single discount rule.
 * A voucher is a payment method, redeemable partially across multiple sales until exhausted.
 */
@Injectable()
export class VouchersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async issue(businessId: string, dto: IssueVoucherDto) {
    const code = dto.code ?? generateVoucherCode();

    let customer: { id: string; name: string } | null = null;
    if (dto.customerId) {
      customer = await this.tenantPrisma.client.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
    }

    let voucher: Voucher;
    try {
      voucher = await this.tenantPrisma.client.voucher.create({
        data: {
          businessId,
          code,
          customerId: dto.customerId,
          initialValue: dto.value,
          balance: dto.value,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppException(
          VOUCHER_ERROR_CODES.DUPLICATE_CODE,
          `Voucher code "${code}" already exists`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    if (customer) {
      await this.sendGate
        .send({
          businessId,
          customerId: customer.id,
          templateKey: VOUCHER_ISSUED_TEMPLATE_KEY,
          variables: {
            customerName: customer.name,
            amount: dto.value.toFixed(2),
            code,
          },
        })
        .catch(() => undefined);
    }

    return voucher;
  }

  list() {
    return this.tenantPrisma.client.voucher.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const voucher = await this.tenantPrisma.client.voucher.findUnique({
      where: { id },
    });
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }
    return voucher;
  }

  async cancel(id: string) {
    await this.findOne(id);
    return this.tenantPrisma.client.voucher.update({
      where: { id },
      data: { status: VoucherStatus.cancelled },
    });
  }

  /**
   * Validates a voucher code and applies as much of `requestedAmount` as its real balance and
   * the order's real total allow — called from inside `OrdersService.createSale`'s transaction,
   * after `computeOrderTotals`. A voucher offsets the amount collected via payment/credit, it
   * never changes `Order.total` itself (it's a payment method, not a discount).
   */
  async validateAndApply(
    businessId: string,
    code: string,
    requestedAmount: number,
    orderTotal: number,
    tx: VoucherTxClient,
  ): Promise<{ voucherId: string; amountApplied: number }> {
    const voucher = await tx.voucher.findUnique({
      where: { businessId_code: { businessId, code } },
    });
    if (!voucher) {
      throw new AppException(
        VOUCHER_ERROR_CODES.NOT_FOUND,
        `Voucher "${code}" not found`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (voucher.status !== VoucherStatus.active) {
      throw new AppException(
        VOUCHER_ERROR_CODES.NOT_ACTIVE,
        `Voucher is "${voucher.status}", expected "active"`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (voucher.expiresAt && voucher.expiresAt < new Date()) {
      throw new AppException(
        VOUCHER_ERROR_CODES.EXPIRED,
        'Voucher has expired',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (requestedAmount <= 0) {
      throw new AppException(
        VOUCHER_ERROR_CODES.INVALID_AMOUNT,
        'Voucher amount must be greater than zero',
        HttpStatus.BAD_REQUEST,
      );
    }

    const balance = Number(voucher.balance);
    const amountApplied = round2(
      Math.min(requestedAmount, balance, orderTotal),
    );
    const newBalance = round2(balance - amountApplied);

    await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        balance: newBalance,
        status: newBalance <= 0 ? VoucherStatus.redeemed : undefined,
      },
    });

    return { voucherId: voucher.id, amountApplied };
  }
}
