import { HttpStatus, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { EntitlementsService } from './entitlements.service';
import { MetersService } from './meters.service';
import { UsageReadService } from './usage-read.service';
import { METRICS, USAGE_ERROR_CODES } from './usage.constants';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Areas that always accept writes even when storage is full. They still count towards usage.
 * Data exports must work at any time, including when the account is full or cancelling
 * ("Export everything anytime"), so they are never refused.
 */
const NEVER_BLOCKED_AREAS = new Set(['exports', 'customer-exports']);

/**
 * Storage allowance per plan (pricing page C7: 10 / 50 / 200 / 500 GB, $5 per extra 100 GB).
 *
 * Every upload in the app goes through S3Service, keyed `<area>/<businessId>/…`, so one guard
 * registered there covers every feature (recordings, scans, product images, contracts, …) with
 * no per-module wiring. Usage is the real bytes stored under the business group's folders
 * (the same measurement the Usage screen shows), plus what was written since it was measured.
 */
@Injectable()
export class StorageQuotaService implements OnModuleInit {
  /** Bytes written since the cached measurement, per root business. */
  private readonly pending = new Map<
    string,
    { since: number; bytes: number }
  >();

  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly meters: MetersService,
    private readonly usage: UsageReadService,
    @Optional() private readonly s3?: S3Service,
  ) {}

  onModuleInit() {
    this.s3?.setUploadGuard((key, sizeBytes) =>
      this.assertCanStore(key, sizeBytes),
    );
  }

  async assertCanStore(key: string, sizeBytes: number): Promise<void> {
    const [area, businessId] = key.split('/');
    if (!businessId || !UUID.test(businessId)) return;
    let rootId: string;
    try {
      rootId = await this.entitlements.rootId(businessId);
    } catch {
      return; // Not a business folder.
    }
    const plan = await this.meters.planLimit(rootId, METRICS.STORAGE_BYTES);
    if (plan.limit == null) return;

    const measured = await this.usage.storage(rootId);
    if (!measured) return; // Storage can't be measured right now: never block on a guess.
    const pend = this.pending.get(rootId);
    const sinceMeasure =
      pend && pend.since >= Date.now() - 10 * 60_000 ? pend.bytes : 0;
    const used = measured.bytes + sinceMeasure;

    if (!NEVER_BLOCKED_AREAS.has(area) && used + sizeBytes > plan.limit) {
      throw new AppException(
        USAGE_ERROR_CODES.ALLOWANCE_EXHAUSTED,
        `Your storage is full (${gb(used)} of ${gb(plan.limit)} on ${plan.planName}). Delete files you no longer need, or add 100 GB for $5 a month in Settings → Usage.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    this.pending.set(rootId, {
      since: pend?.since ?? Date.now(),
      bytes: sinceMeasure + sizeBytes,
    });
  }
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
