import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CustomerIntelligenceService } from '../../customers/customer-intelligence.service';
import { CommerceSpecialistAgentService } from '../../commerce/commerce-specialist-agent.service';
import { InventoryIntelligenceService } from '../../inventory/inventory-intelligence.service';
import { FinancialIntelligenceService } from '../../profit/financial-intelligence.service';
import { SeoSpecialistAgentService } from '../../seo-workspace/seo-specialist-agent.service';
import { resolvePolicies } from '../policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../tenancy/tenant.constants';
import {
  specialistAgentDailyIdempotencyKey,
  specialistAgentIdempotencyHash,
  specialistAgentUtcDateKey,
} from './specialist-agent-schedule.util';
import { SPECIALIST_AGENT_SCHEDULE_QUEUE } from './specialist-agent-schedules.constants';
import type { SpecialistAgentRunOptions } from './specialist-agent-run-options';
import { SpecialistAgentPolicyService } from './specialist-agent-policy.service';
import { SPECIALIST_AGENT_REGISTRY } from './specialist-agent-registry';

const DAILY_AGENT_POLICIES = SPECIALIST_AGENT_REGISTRY;

const SCHEDULED_RUN_OPTIONS: SpecialistAgentRunOptions = {
  triggerType: 'scheduled',
  includeAiSummary: false,
};

@Processor(SPECIALIST_AGENT_SCHEDULE_QUEUE)
@Injectable()
export class SpecialistAgentScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(SpecialistAgentScheduleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly inventory: InventoryIntelligenceService,
    private readonly finance: FinancialIntelligenceService,
    private readonly customers: CustomerIntelligenceService,
    private readonly seo: SeoSpecialistAgentService,
    private readonly commerce: CommerceSpecialistAgentService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'tick') await this.runTick();
  }

  /**
   * Runs explicitly enabled, read-only daily reviews. The run's existing idempotency key is the
   * durable per-business/per-agent/per-UTC-day guard, so simultaneous ticks cannot duplicate work.
   */
  async runTick(now = new Date()) {
    const date = specialistAgentUtcDateKey(now);
    const month = date.slice(0, 7);
    let afterId: string | undefined;
    let checkedBusinesses = 0;
    let startedRuns = 0;

    for (;;) {
      const businesses = await this.prisma.business.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          // Daily reviews are default-off. Query only businesses that explicitly enabled at
          // least one schedule instead of walking every tenant and doing a module-policy lookup
          // for each one. Keep the JSON path keyed by the same typed policy names used below.
          OR: DAILY_AGENT_POLICIES.map(({ schedulePolicy }) => ({
            policies: {
              path: `$."${schedulePolicy}"`,
              equals: true,
            },
          })),
        },
        orderBy: { id: 'asc' },
        take: 100,
        select: { id: true, policies: true },
      });
      if (businesses.length === 0) break;
      afterId = businesses[businesses.length - 1].id;
      checkedBusinesses += businesses.length;

      for (const business of businesses) {
        const policies = resolvePolicies(business);
        let disabledModules: Set<string>;
        try {
          disabledModules = new Set(
            await this.agentPolicy.disabledModulesForBusiness(business.id),
          );
        } catch (error) {
          // Businesses may be deleted between the page query and this lookup. Fail closed for
          // this tick instead of aborting the scheduler or running a module on stale state.
          this.logger.warn(
            `Skipping specialist schedules for ${business.id}: ${(error as Error).message}`,
          );
          continue;
        }
        for (const agent of DAILY_AGENT_POLICIES) {
          if (
            disabledModules.has(agent.moduleKey) ||
            !policies.bool(agent.enabledPolicy) ||
            !policies.bool(agent.schedulePolicy) ||
            (agent.agentKey === 'autonomous_commerce' &&
              (policies.num('commerce.autonomyLevel') ?? 0) <= 0)
          ) {
            continue;
          }

          const key = specialistAgentDailyIdempotencyKey(
            agent.agentKey,
            business.id,
            date,
          );
          const idempotencyKeyHash = specialistAgentIdempotencyHash(key);
          const existing = await this.prisma.specialistAgentRun.findFirst({
            where: {
              businessId: business.id,
              agentKey: agent.agentKey,
              triggerType: 'scheduled',
              idempotencyKeyHash,
            },
            select: { id: true },
          });
          if (existing) continue;

          try {
            await this.cls.run(async () => {
              this.cls.set(CLS_KEY_BUSINESS_ID, business.id);
              await this.runAgent(agent.agentKey, business.id, key, month);
            });
            startedRuns += 1;
          } catch (error) {
            this.logger.warn(
              `Scheduled ${agent.agentKey} review failed for ${business.id}: ${(error as Error).message}`,
            );
          }
        }
      }
      if (businesses.length < 100) break;
    }

    return { date, checkedBusinesses, startedRuns };
  }

  private async runAgent(
    agentKey: (typeof DAILY_AGENT_POLICIES)[number]['agentKey'],
    businessId: string,
    idempotencyKey: string,
    month: string,
  ): Promise<unknown> {
    switch (agentKey) {
      case 'inventory_intelligence':
        return this.inventory.run(
          businessId,
          null,
          idempotencyKey,
          SCHEDULED_RUN_OPTIONS,
        );
      case 'financial_intelligence':
        return this.finance.run(
          businessId,
          null,
          { month, period: 'month' },
          idempotencyKey,
          SCHEDULED_RUN_OPTIONS,
        );
      case 'customer_intelligence': {
        return this.customers.run(
          businessId,
          null,
          'current_business',
          idempotencyKey,
          businessId,
          SCHEDULED_RUN_OPTIONS,
        );
      }
      case 'seo_autopilot':
        return this.seo.run(
          businessId,
          null,
          idempotencyKey,
          SCHEDULED_RUN_OPTIONS,
        );
      case 'autonomous_commerce':
        return this.commerce.run(
          businessId,
          null,
          idempotencyKey,
          SCHEDULED_RUN_OPTIONS,
        );
    }
  }
}
