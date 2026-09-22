import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AdSettingsService } from './ad-settings.service';

export interface AdRuleDto {
  id: string;
  name: string;
  when: string;
  then: string;
  guard: string;
  fired: number;
  on: boolean;
  locked?: boolean;
}

/**
 * Rules & Automation. There is exactly one real automated rule in this codebase —
 * `AdAutoPauseProcessor`, which pauses a campaign for real when its real cost-per-result crosses
 * `AdSettings.autoPauseCostPerResult` — so that is the only rule this screen shows. Earlier
 * versions of this screen also showed four more "rules" and a "pending approval" suggestion; none
 * of those had any code behind them (in-memory canned data, reset on every server restart), so
 * they have been removed rather than left as decoration. `fired` is a real count of
 * `ad.auto_pause` audit-log entries this processor writes each time it actually pauses something.
 */
@Injectable()
export class AdRulesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly settings: AdSettingsService,
  ) {}

  private async autoPauseRule(businessId: string): Promise<AdRuleDto> {
    const s = await this.settings.get(businessId);
    const threshold = s.autoPauseCostPerResult != null ? Number(s.autoPauseCostPerResult) : null;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fired = await this.tenantPrisma.client.auditLog.count({
      where: { businessId, action: 'ad.auto_pause', createdAt: { gte: since } },
    });

    return {
      id: 'auto-pause-cost-per-result',
      name: 'Pause on runaway cost per result',
      when: threshold != null ? `Cost per result above Rs. ${threshold.toLocaleString('en-US')}` : 'Set a threshold to turn this on',
      then: 'Pause the campaign',
      guard: 'Checked hourly against each campaign’s own real stats',
      fired,
      on: threshold != null,
    };
  }

  async list(businessId: string) {
    const rule = await this.autoPauseRule(businessId);
    return {
      kpis: [
        { label: 'Active rules', value: rule.on ? '1' : '0', color: '#0F172A' },
        { label: 'Fired this week', value: String(rule.fired), color: '#0F172A' },
      ],
      rules: [rule],
      // No real suggestion/anomaly-detection engine exists — never fabricated.
      pendingApproval: null,
    };
  }

  /** Turns the one real rule on (at its last threshold, or a default) or off. */
  async toggle(businessId: string, ruleId: string) {
    if (ruleId !== 'auto-pause-cost-per-result') {
      throw new BadRequestException('Rule not found');
    }
    const current = await this.settings.get(businessId);
    const turningOn = current.autoPauseCostPerResult == null;
    const nextThreshold = turningOn ? (Number(current.defaultDailyBudgetCap) || 3000) : null;
    await this.settings.update(businessId, { autoPauseCostPerResult: nextThreshold });
    return { success: true, rule: await this.autoPauseRule(businessId) };
  }
}
