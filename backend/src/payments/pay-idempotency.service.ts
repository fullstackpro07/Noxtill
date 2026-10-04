import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PAY_ERRORS } from './payments.constants';

export type IdemStatus = 'in_flight' | 'done' | 'failed' | 'unknown';

/**
 * Every money write goes through here before it reaches a provider. A key that is already in
 * flight is refused (no second request is sent); a key that completed replays its stored result;
 * a failed or unknown key may run again with the SAME key, so the provider replays its own result
 * instead of moving money twice. A key reused with different inputs is a conflict.
 */
@Injectable()
export class PayIdempotencyService {
  /** An in-flight key older than this is treated as unknown (the worker died mid-call). */
  static readonly STALE_MS = 10 * 60_000;

  constructor(private readonly prisma: PrismaService) {}

  hash(input: unknown) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  async begin(
    businessId: string,
    key: string,
    op: string,
    input: unknown,
  ): Promise<{ replay: Prisma.JsonValue | null }> {
    const requestHash = this.hash(input);
    const row = await this.prisma.payIdempotency.findUnique({ where: { key } });
    if (row) {
      if (row.requestHash !== requestHash)
        throw new AppException(
          PAY_ERRORS.CONFLICT,
          `Idempotency key ${key} was already used for a different request.`,
          HttpStatus.CONFLICT,
        );
      if (row.status === 'done')
        return { replay: row.result ?? { replayed: true } };
      if (
        row.status === 'in_flight' &&
        Date.now() - row.updatedAt.getTime() < PayIdempotencyService.STALE_MS
      )
        throw new AppException(
          PAY_ERRORS.DUPLICATE_OPERATION,
          `Already in progress with idempotency key ${key}. No second request was sent.`,
          HttpStatus.CONFLICT,
        );
      await this.prisma.payIdempotency.update({
        where: { key },
        data: { status: 'in_flight' },
      });
      return { replay: null };
    }
    try {
      await this.prisma.payIdempotency.create({
        data: { businessId, key, op, requestHash, status: 'in_flight' },
      });
    } catch {
      throw new AppException(
        PAY_ERRORS.DUPLICATE_OPERATION,
        `Already in progress with idempotency key ${key}. No second request was sent.`,
        HttpStatus.CONFLICT,
      );
    }
    return { replay: null };
  }

  async finish(
    key: string,
    status: Exclude<IdemStatus, 'in_flight'>,
    result?: unknown,
    providerObjectId?: string | null,
  ) {
    await this.prisma.payIdempotency.update({
      where: { key },
      data: {
        status,
        result:
          result === undefined ? undefined : (result as Prisma.InputJsonValue),
        providerObjectId: providerObjectId ?? undefined,
      },
    });
  }

  async get(key: string) {
    return this.prisma.payIdempotency.findUnique({ where: { key } });
  }
}
