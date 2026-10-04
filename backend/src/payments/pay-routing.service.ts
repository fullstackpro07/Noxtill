import { HttpStatus, Injectable } from '@nestjs/common';
import { PayMethodConfig, PayRoutingRule, Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, dec, num } from './pay-context.service';
import { PayStripeService } from './pay-stripe.service';
import {
  CHANNELS,
  PAY_ERRORS,
  PRECEDENCE,
  providerDef,
  providerName,
} from './payments.constants';

export interface RouteInput {
  channel: string;
  branch: string;
  country: string;
  currency: string;
  amount: number;
  method: string;
}

export interface RuleConds {
  branch?: string | null;
  channel?: string | null;
  country?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

/**
 * Which method is offered where and which provider handles it. Routing decides the provider for
 * the checkouts Noxtill itself runs (payment links and the /pay page); POS and website checkout
 * read the method matrix but are not blocked by it. Precedence: Branch › Channel ›
 * Country/currency › Global default — first match wins; exact ties are rejected on save.
 */
@Injectable()
export class PayRoutingService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly stripe: PayStripeService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async methods(rootId: string) {
    await this.ctx.ensure(rootId);
    return this.db.payMethodConfig.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async rules(rootId: string) {
    const rows = await this.db.payRoutingRule.findMany({
      where: { businessId: rootId },
    });
    return rows.sort(
      (a, b) =>
        PRECEDENCE.indexOf(a.level) - PRECEDENCE.indexOf(b.level) ||
        a.priority - b.priority,
    );
  }

  /** Can a provider take this method at all (and is it connected for live)? */
  async supported(rootId: string, method: string, provider: string | null) {
    if (!provider) return false;
    const def = providerDef(provider);
    if (!def || !def.methods.includes(method)) return false;
    if (provider === 'manual') return true;
    const c = await this.stripe.connection(rootId, provider, 'live');
    // A provider supports a method only if Noxtill can actually take payments through it.
    return (
      !!c &&
      !['Disconnected', 'Connection Required'].includes(c.status) &&
      c.writeEnabled &&
      this.stripe.configured('live')
    );
  }

  private validProvider(
    method: string,
    provider: string | null | undefined,
    label: string,
  ) {
    if (!provider) return;
    const def = providerDef(provider);
    if (!def)
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        `${providerName(provider)} has no adapter in Noxtill.`,
        HttpStatus.BAD_REQUEST,
      );
    if (!def.methods.includes(method))
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        `${label}: ${def.name} doesn’t support ${method}.`,
        HttpStatus.BAD_REQUEST,
      );
  }

  async setMethod(
    a: PayActor,
    method: string,
    p: {
      enabled?: boolean;
      primary?: string | null;
      fallback?: string | null;
      minAmount?: number;
      maxAmount?: number;
      channels?: string[];
      reason?: string;
    },
  ) {
    this.ctx.need(a, 'admin', 'Changing payment methods');
    const m = await this.db.payMethodConfig.findFirst({
      where: { businessId: a.rootId, method },
    });
    if (!m)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Method not found',
        HttpStatus.NOT_FOUND,
      );
    const primary = p.primary !== undefined ? p.primary : m.primary;
    const fallback = p.fallback !== undefined ? p.fallback : m.fallback;
    this.validProvider(method, primary, 'Primary');
    this.validProvider(method, fallback, 'Fallback');
    if (fallback && fallback === primary)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Fallback must be a different provider (no loops).',
        HttpStatus.BAD_REQUEST,
      );
    if (p.enabled && !(await this.supported(a.rootId, method, primary)))
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        `No connected provider supports ${method} — connect one in Integrations first.`,
        HttpStatus.BAD_REQUEST,
      );
    const min = p.minAmount ?? num(m.minAmount);
    const max = p.maxAmount ?? num(m.maxAmount);
    if (min < 0 || max < min)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Max must be at least the min.',
        HttpStatus.BAD_REQUEST,
      );
    const channels = p.channels
      ? p.channels.filter((c) => CHANNELS.includes(c))
      : (m.channels as string[]);
    const row = await this.db.payMethodConfig.update({
      where: { id: m.id },
      data: {
        enabled: p.enabled ?? m.enabled,
        primary,
        fallback,
        minAmount: dec(min),
        maxAmount: dec(max),
        channels,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Method changed',
      'routing',
      m.id,
      `${method}: ${row.enabled ? 'enabled' : 'disabled'} · ${providerName(primary)} → ${fallback ? providerName(fallback) : 'no fallback'}${p.reason ? ` · ${p.reason}` : ''}`,
    );
    return row;
  }

  private conds(c: RuleConds): RuleConds {
    return {
      branch: c.branch || null,
      channel: c.channel || null,
      country: c.country || null,
      currency: c.currency || null,
      minAmount:
        c.minAmount != null && Number(c.minAmount) > 0
          ? Number(c.minAmount)
          : null,
      maxAmount:
        c.maxAmount != null && Number(c.maxAmount) > 0
          ? Number(c.maxAmount)
          : null,
    };
  }

  async saveRule(
    a: PayActor,
    id: string | null,
    p: {
      name: string;
      level: string;
      priority: number;
      method: string;
      primary: string;
      fallback?: string | null;
      conditions: RuleConds;
      reason?: string;
    },
  ) {
    this.ctx.need(a, 'admin', 'Changing routing rules');
    if (!PRECEDENCE.includes(p.level))
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Pick a level.',
        HttpStatus.BAD_REQUEST,
      );
    this.validProvider(p.method, p.primary, 'Primary');
    this.validProvider(p.method, p.fallback, 'Fallback');
    if (p.fallback && p.fallback === p.primary)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Fallback must be a different provider (no loops).',
        HttpStatus.BAD_REQUEST,
      );
    const conds = this.conds(p.conditions);
    if (conds.minAmount && conds.maxAmount && conds.maxAmount < conds.minAmount)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Max amount must be at least the min.',
        HttpStatus.BAD_REQUEST,
      );
    if (conds.channel && !CHANNELS.includes(conds.channel))
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Unknown channel.',
        HttpStatus.BAD_REQUEST,
      );
    const all = await this.rules(a.rootId);
    const tie = all.find(
      (r) =>
        r.id !== id &&
        r.status === 'Active' &&
        r.level === p.level &&
        r.priority === p.priority &&
        r.method === p.method &&
        JSON.stringify(this.conds(r.conditions as RuleConds)) ===
          JSON.stringify(conds),
    );
    if (tie)
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `Ties are rejected: “${tie.name}” already matches the same payments at the same level and priority.`,
        HttpStatus.CONFLICT,
      );
    let row: PayRoutingRule;
    if (id) {
      const prev = all.find((r) => r.id === id);
      if (!prev)
        throw new AppException(
          PAY_ERRORS.NOT_FOUND,
          'Rule not found',
          HttpStatus.NOT_FOUND,
        );
      row = await this.db.payRoutingRule.update({
        where: { id },
        data: {
          name: p.name,
          level: p.level,
          priority: p.priority,
          method: p.method,
          primary: p.primary,
          fallback: p.fallback || null,
          conditions: conds as Prisma.InputJsonValue,
          version: prev.version + 1,
        },
      });
    } else {
      row = await this.db.payRoutingRule.create({
        data: {
          businessId: a.rootId,
          number: await this.ctx.next(a.rootId, 'ruleSeq'),
          name: p.name,
          level: p.level,
          priority: p.priority,
          method: p.method,
          primary: p.primary,
          fallback: p.fallback || null,
          conditions: conds as Prisma.InputJsonValue,
          status: 'Active',
          version: 1,
          createdById: a.userId,
        },
      });
    }
    await this.db.payRoutingRuleVersion.create({
      data: {
        businessId: a.rootId,
        ruleId: row.id,
        version: row.version,
        snapshot: row,
        byId: a.userId,
        reason: p.reason ?? null,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      id ? 'Routing rule edited' : 'Routing rule created',
      'routing',
      row.id,
      `${row.name} v${row.version} · ${row.method} → ${providerName(row.primary)}`,
    );
    return row;
  }

  async ruleAction(
    a: PayActor,
    id: string,
    action: 'up' | 'down' | 'enable' | 'disable',
  ) {
    this.ctx.need(a, 'admin', 'Changing routing rules');
    const all = await this.rules(a.rootId);
    const r = all.find((x) => x.id === id);
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Rule not found',
        HttpStatus.NOT_FOUND,
      );
    if (action === 'enable' || action === 'disable') {
      await this.db.payRoutingRule.update({
        where: { id },
        data: {
          status: action === 'enable' ? 'Active' : 'Disabled',
          version: r.version + 1,
        },
      });
    } else {
      const same = all.filter((x) => x.level === r.level);
      const i = same.findIndex((x) => x.id === id);
      const j = action === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= same.length)
        throw new AppException(
          PAY_ERRORS.CONFLICT,
          `Already ${action === 'up' ? 'first' : 'last'} within ${r.level}.`,
          HttpStatus.CONFLICT,
        );
      const other = same[j];
      await this.db.$transaction([
        this.db.payRoutingRule.update({
          where: { id: r.id },
          data: {
            priority:
              other.priority === r.priority
                ? r.priority + (action === 'up' ? -1 : 1)
                : other.priority,
            version: r.version + 1,
          },
        }),
        this.db.payRoutingRule.update({
          where: { id: other.id },
          data: { priority: r.priority, version: other.version + 1 },
        }),
      ]);
    }
    const after = await this.db.payRoutingRule.findUniqueOrThrow({
      where: { id },
    });
    await this.db.payRoutingRuleVersion.create({
      data: {
        businessId: a.rootId,
        ruleId: id,
        version: after.version,
        snapshot: after,
        byId: a.userId,
        reason: action,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `Routing rule ${action}`,
      'routing',
      id,
      `${r.name} v${after.version}`,
    );
  }

  /** The design's route(): method gate → first matching rule by precedence → health fallback. */
  async evaluate(rootId: string, inp: RouteInput) {
    const methods = await this.methods(rootId);
    const m = methods.find((x) => x.method === inp.method);
    if (!m || !m.enabled)
      return {
        err: 'METHOD_NOT_SUPPORTED',
        why: `${inp.method} is not enabled.`,
      };
    if (!(m.channels as string[]).includes(inp.channel))
      return {
        err: 'METHOD_NOT_SUPPORTED',
        why: `${inp.method} isn’t offered on ${inp.channel}.`,
      };
    if (inp.amount < num(m.minAmount) || inp.amount > num(m.maxAmount))
      return {
        err: 'AMOUNT_OUT_OF_RANGE',
        why: `Amount outside ${num(m.minAmount)} – ${num(m.maxAmount)} for ${inp.method}.`,
      };
    const steps: string[] = [];
    let hit: PayRoutingRule | null = null;
    for (const r of await this.rules(rootId)) {
      if (r.status !== 'Active' || r.method !== inp.method) continue;
      const c = this.conds(r.conditions as RuleConds);
      const ok =
        (!c.branch || c.branch === inp.branch) &&
        (!c.channel || c.channel === inp.channel) &&
        (!c.country || c.country === inp.country) &&
        (!c.currency || c.currency === inp.currency) &&
        (!c.minAmount || inp.amount >= c.minAmount) &&
        (!c.maxAmount || inp.amount <= c.maxAmount);
      steps.push(`${ok ? '✓' : '✕'} ${r.name} (${r.level})`);
      if (ok) {
        hit = r;
        break;
      }
    }
    const pri = hit ? hit.primary : m.primary;
    const fb = hit ? hit.fallback : m.fallback;
    let why = hit
      ? `Matched rule “${hit.name}” at ${hit.level} level`
      : 'No rule matched — method default';
    if (!pri)
      return {
        err: 'METHOD_NOT_SUPPORTED',
        why: `${inp.method} has no primary provider.`,
        steps,
      };
    const conn =
      pri === 'manual'
        ? null
        : await this.stripe.connection(rootId, pri, 'live');
    if (pri !== 'manual') {
      if (
        !conn ||
        ['Disconnected', 'Connection Required'].includes(conn.status)
      ) {
        if (!fb)
          return {
            err: 'CONNECTION_REQUIRED',
            why: `${providerName(pri)} isn’t connected and there is no fallback.`,
            steps,
          };
      } else if (
        conn.defaultCurrency &&
        inp.currency !== conn.defaultCurrency &&
        conn.country &&
        inp.country !== conn.country
      ) {
        // The provider reports its own account country/currency; other combinations are not assumed.
        steps.push(
          `ⓘ ${providerName(pri)} account is ${conn.country}/${conn.defaultCurrency}`,
        );
      }
    }
    let chosen = pri;
    if (pri !== 'manual' && (!conn || conn.status !== 'Connected') && fb) {
      chosen = fb;
      why += ` · primary ${conn ? conn.status.toLowerCase() : 'not connected'}, fallback used`;
    }
    const fees = await this.feeRate(rootId, chosen);
    return {
      chosen,
      pri,
      fb,
      why,
      rule: hit ? { name: hit.name, v: hit.version } : null,
      steps,
      feeRate: fees,
      settle:
        chosen === 'manual'
          ? 'n/a'
          : ((await this.stripe.connection(rootId, chosen, 'live'))
              ?.payoutSchedule ?? 'Not reported by the provider yet'),
    };
  }

  /** The business's own effective fee rate with a provider (actual fees ÷ captured, last 90 days). */
  async feeRate(rootId: string, provider: string): Promise<number | null> {
    if (provider === 'manual') return 0;
    const agg = await this.db.payTransaction.aggregate({
      where: {
        businessId: rootId,
        provider,
        env: 'live',
        feeSource: 'actual',
        status: 'Succeeded',
        occurredAt: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      _sum: { fee: true, captured: true },
    });
    const cap = num(agg._sum.captured);
    return cap > 0 ? (num(agg._sum.fee) / cap) * 100 : null;
  }

  /** Last-30-day payments that would follow this route. */
  async impact(
    rootId: string,
    p: {
      method: string;
      channel?: string | null;
      branch?: string | null;
      currency?: string | null;
    },
  ) {
    const where: Prisma.PayTransactionWhereInput = {
      businessId: rootId,
      env: 'live',
      status: 'Succeeded',
      method: p.method,
      occurredAt: { gte: new Date(Date.now() - 30 * 86400000) },
      ...(p.channel ? { channel: p.channel } : {}),
      ...(p.branch ? { branchId: p.branch } : {}),
      ...(p.currency ? { currency: p.currency } : {}),
    };
    const agg = await this.db.payTransaction.aggregate({
      where,
      _count: true,
      _sum: { reportAmount: true },
    });
    const tot = await this.db.payTransaction.aggregate({
      where: {
        businessId: rootId,
        env: 'live',
        status: 'Succeeded',
        occurredAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      _sum: { reportAmount: true },
    });
    const share = num(tot._sum.reportAmount)
      ? num(agg._sum.reportAmount) / num(tot._sum.reportAmount)
      : 0;
    return {
      n: agg._count,
      v: num(agg._sum.reportAmount),
      share,
      high: share >= 0.25,
    };
  }

  methodRow(m: PayMethodConfig) {
    return m;
  }
}
