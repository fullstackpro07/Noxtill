import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { CtActor, CtContextService, ctErr } from './ct-context.service';
import {
  CT_ERRORS,
  CT_SECS,
  CtConfig,
  FILE_TYPES,
  REMIND_DAYS,
  RETENTIONS,
  mergeCtConfig,
} from './ct.constants';

/** Versioned Contracts settings — every save is validated, diffed by section and audited. */
@Injectable()
export class CtSettingsService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async validate(a: CtActor, c: CtConfig) {
    const members = await this.ctx.members(a.rootId);
    const err = (m: string) => {
      throw ctErr(CT_ERRORS.INVALID, `VALIDATION_ERROR — ${m}`);
    };
    if (!c.numbering.docPrefix?.trim() || c.numbering.docPrefix.length > 12)
      err('document prefix must be 1–12 characters.');
    if (!/\{0+\}/.test(c.numbering.ctrPattern ?? ''))
      err('contract pattern needs a sequence like {000000}.');
    if (!['Never', 'Yearly'].includes(c.numbering.reset))
      err('sequence reset must be Never or Yearly.');
    if (
      !c.files.types.length ||
      c.files.types.some((t) => !FILE_TYPES.includes(t))
    )
      err('allow at least one supported file type.');
    if (!(Number(c.files.maxMb) > 0 && Number(c.files.maxMb) <= 200))
      err('max file size must be 1–200 MB.');
    if (!(Number(c.files.perUpload) >= 1 && Number(c.files.perUpload) <= 50))
      err('files per upload must be 1–50.');
    if (!c.folders.list.length) err('keep at least one folder.');
    const used = await this.db.ctDocument.groupBy({
      by: ['folder'],
      where: { businessId: a.rootId },
    });
    const gone = used
      .map((u) => u.folder)
      .filter((f) => !c.folders.list.includes(f));
    if (gone.length)
      err(
        `“${gone.join('”, “')}” still contain documents — move them before removing the folder.`,
      );
    if (![...RETENTIONS].includes(c.retention.default))
      err('choose a default retention.');
    if (!(
      Number(c.contract.expiringDays) >= 1 &&
      Number(c.contract.expiringDays) <= 180
    ))
      err('“expiring” window must be 1–180 days.');
    if (!c.esign.methods.length) err('allow at least one signature method.');
    if (!(Number(c.esign.expiryDays) >= 1 && Number(c.esign.expiryDays) <= 90))
      err('request expiry must be 1–90 days.');
    if (!Object.keys(REMIND_DAYS).includes(c.esign.reminders))
      err('choose a reminder cadence.');
    if (!c.auth.methods.length)
      err('allow at least one signer authentication method.');
    if (!(Number(c.approvals.threshold) >= 0))
      err('approval threshold must be zero or more.');
    if (!(
      Number(c.approvals.dueDays) >= 1 && Number(c.approvals.dueDays) <= 30
    ))
      err('approval due days must be 1–30.');
    for (const k of [
      'financeUserId',
      'hrUserId',
      'legalUserId',
      'signatoryUserId',
    ] as const)
      if (c.approvals[k] && !members.some((m) => m.id === c.approvals[k]))
        err('an approver is no longer on the staff list.');
    if (c.contract.ownerId && !members.some((m) => m.id === c.contract.ownerId))
      err('the default owner is no longer on the staff list.');
  }

  /** Checks a draft against every save rule without saving it. */
  async check(a: CtActor, raw: unknown) {
    const next = mergeCtConfig(raw);
    next.files.maxMb = Number(next.files.maxMb);
    next.files.perUpload = Number(next.files.perUpload);
    next.contract.expiringDays = Number(next.contract.expiringDays);
    next.esign.expiryDays = Number(next.esign.expiryDays);
    next.auth.otpAbove = Number(next.auth.otpAbove);
    next.approvals.threshold = Number(next.approvals.threshold);
    next.approvals.dueDays = Number(next.approvals.dueDays);
    await this.validate(a, next);
    return { ok: true };
  }

  async save(a: CtActor, raw: unknown, expectedVersion?: number) {
    this.ctx.need(a, 'settings', 'Changing Contracts settings');
    const s = await this.ctx.ensure(a.rootId);
    if (expectedVersion != null && expectedVersion !== s.version)
      throw ctErr(
        CT_ERRORS.CONFLICT,
        `VERSION_CONFLICT — settings were saved by someone else (now v${s.version}). Reload and re-apply.`,
        HttpStatus.CONFLICT,
      );
    const cur = mergeCtConfig(s.config);
    const next = mergeCtConfig(raw);
    next.files.maxMb = Number(next.files.maxMb);
    next.files.perUpload = Number(next.files.perUpload);
    next.contract.expiringDays = Number(next.contract.expiringDays);
    next.esign.expiryDays = Number(next.esign.expiryDays);
    next.auth.otpAbove = Number(next.auth.otpAbove);
    next.approvals.threshold = Number(next.approvals.threshold);
    next.approvals.dueDays = Number(next.approvals.dueDays);
    await this.validate(a, next);
    const changed = CT_SECS.filter(
      ([k]) =>
        JSON.stringify((cur as unknown as Record<string, unknown>)[k]) !==
        JSON.stringify((next as unknown as Record<string, unknown>)[k]),
    ).map((x) => x[1]);
    if (!changed.length) return { version: s.version, changed };
    const v = s.version + 1;
    await this.db.$transaction(async (tx) => {
      const n = await tx.ctSettings.updateMany({
        where: { businessId: a.rootId, version: s.version },
        data: { config: next as unknown as Prisma.InputJsonValue, version: v },
      });
      if (!n.count)
        throw ctErr(
          CT_ERRORS.CONFLICT,
          'VERSION_CONFLICT — saved by someone else a moment ago.',
          HttpStatus.CONFLICT,
        );
      await tx.ctSettingsVersion.create({
        data: {
          businessId: a.rootId,
          version: v,
          config: next as unknown as Prisma.InputJsonValue,
          changed,
          byUserId: a.userId,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Settings changed',
        'settings',
        a.rootId,
        `v${v} · ${changed.join(', ')}`,
        { tx },
      );
    });
    return { version: v, changed };
  }

  /** Honest check of what Noxtill eSign depends on — the outbound email provider. */
  emailHealth() {
    const key = this.config.get<string>('EMAIL_PROVIDER_KEY');
    const from = this.config.get<string>('EMAIL_FROM_ADDRESS');
    if (!key || !from)
      return {
        ok: false,
        message:
          'Email isn’t configured (EMAIL_PROVIDER_KEY / EMAIL_FROM_ADDRESS) — signing links can’t be emailed; use “Signing link” to hand them over yourself.',
      };
    return {
      ok: true,
      message: `Email provider configured (Resend) · sends from ${from}. Delivery is confirmed per signer when each email is accepted.`,
    };
  }
}
