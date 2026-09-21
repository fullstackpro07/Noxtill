import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

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

export interface AdPendingApprovalDto {
  id: string;
  title: string;
  why: string;
  impact: string;
  confidence: 'High' | 'Medium' | 'Low';
  campaignId?: string;
  suggestedBudget?: number;
}

@Injectable()
export class AdRulesService {
  // Per-business in-memory rule state map
  private readonly rulesState = new Map<
    string,
    {
      rules: AdRuleDto[];
      pending: AdPendingApprovalDto | null;
      blockedCount: number;
    }
  >();

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private getOrCreateState(businessId: string) {
    let state = this.rulesState.get(businessId);
    if (!state) {
      state = {
        rules: [
          {
            id: 'runaway-cpr',
            name: 'Pause on runaway cost per result',
            when: 'Cost per result above Rs. 3,000 for 3 days',
            then: 'Pause the ad and notify me',
            guard: 'Never pauses more than 2 ads a day',
            fired: 1,
            on: true,
          },
          {
            id: 'flag-break-even',
            name: 'Flag return below break-even',
            when: 'Return below 1.0× after Rs. 10,000 spend',
            then: 'Notify me — no automatic change',
            guard: 'Notify only',
            fired: 2,
            on: true,
          },
          {
            id: 'out-of-stock',
            name: 'Stop ads for out-of-stock products',
            when: 'Linked product reaches zero stock',
            then: 'Pause immediately and notify me',
            guard: 'Always on — cannot be disabled',
            fired: 0,
            on: true,
            locked: true,
          },
          {
            id: 'suggest-scaling',
            name: 'Suggest scaling a strong performer',
            when: 'Return above 3.5× and frequency below 3',
            then: 'Request approval to raise budget 20%',
            guard: 'Max +20% per week, needs approval',
            fired: 1,
            on: true,
          },
          {
            id: 'refresh-fatigued',
            name: 'Refresh fatigued creative',
            when: 'Frequency above 5 and click rate falling',
            then: 'Create a task to build a new variant',
            guard: 'Task only — never edits live ads',
            fired: 0,
            on: false,
          },
        ],
        pending: {
          id: 'action-scaling-weekend-bookings',
          title: 'Raise Weekend booking slots budget from Rs. 800 to Rs. 960 a day',
          why: 'Return has held at 3.3× for 9 days and frequency is 1.8, so there is room before fatigue.',
          impact: 'About Rs. 4,800 more spend over the rest of the month.',
          confidence: 'Medium',
          suggestedBudget: 960,
        },
        blockedCount: 2,
      };
      this.rulesState.set(businessId, state);
    }
    return state;
  }

  async list(businessId: string) {
    const state = this.getOrCreateState(businessId);
    const activeCount = state.rules.filter((r) => r.on).length;
    const firedThisWeek = state.rules.reduce((sum, r) => sum + r.fired, 0);

    return {
      kpis: [
        { label: 'Active rules', value: String(activeCount), color: '#0F172A' },
        { label: 'Fired this week', value: String(firedThisWeek), color: '#0F172A' },
        { label: 'Waiting on you', value: state.pending ? '1' : '0', color: '#B54708' },
        { label: 'Blocked by guardrail', value: String(state.blockedCount), color: '#B42318' },
      ],
      rules: state.rules,
      pendingApproval: state.pending,
    };
  }

  async toggle(businessId: string, ruleId: string) {
    const state = this.getOrCreateState(businessId);
    const rule = state.rules.find((r) => r.id === ruleId);
    if (!rule) throw new BadRequestException('Rule not found');
    if (rule.locked) {
      throw new BadRequestException('This rule is a fixed safety rule and cannot be disabled.');
    }

    rule.on = !rule.on;
    return { success: true, rule };
  }

  async approve(businessId: string, actionId: string) {
    const state = this.getOrCreateState(businessId);
    state.pending = null;
    return { success: true, message: 'Approved — the budget change is queued with the platform.' };
  }

  async decline(businessId: string, actionId: string) {
    const state = this.getOrCreateState(businessId);
    state.pending = null;
    return { success: true, message: 'Declined. The rule will not ask again this week.' };
  }
}
