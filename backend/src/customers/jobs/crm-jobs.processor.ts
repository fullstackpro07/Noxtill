import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { WorkflowTriggerService } from '../../marketing/automations/workflow-trigger.service';
import {
  BIRTHDAY_LOCAL_HOUR,
  CRM_JOBS_QUEUE,
  LAPSED_DAYS,
  TAG_RULES_LOCAL_HOUR,
  VIP_LIFETIME_SPEND_THRESHOLD,
} from './crm-jobs.constants';
import { ActivityEventType } from '@prisma/client';

interface CrmTickJobData {
  /** ISO timestamp override, used only by tests to make "current local hour" deterministic. */
  now?: string;
}

/**
 * Handles both CRM hourly ticks (BE-041): tag_rules (VIP/Lapsed) and
 * birthday_greetings, each only acting on a business once it's actually
 * that business's configured local hour.
 */
@Processor(CRM_JOBS_QUEUE)
export class CrmJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmJobsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locale: LocaleService,
    private readonly sendGate: SendGateService,
    private readonly workflowTrigger: WorkflowTriggerService,
  ) {
    super();
  }

  async process(job: Job<CrmTickJobData>): Promise<void> {
    const now = job.data?.now ? new Date(job.data.now) : new Date();
    if (job.name === 'tag-rules-tick') {
      return this.runTagRules(now);
    }
    if (job.name === 'birthday-tick') {
      return this.runBirthdayGreetings(now);
    }
  }

  async runTagRules(now: Date = new Date()): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true, timezone: true },
    });
    const lapsedCutoff = new Date(
      now.getTime() - LAPSED_DAYS * 24 * 60 * 60 * 1000,
    );

    for (const business of businesses) {
      if (
        this.locale.currentLocalTime(business.timezone, now).slice(0, 2) !==
        TAG_RULES_LOCAL_HOUR
      )
        continue;

      const customers = await this.prisma.customer.findMany({
        where: { businessId: business.id },
      });
      for (const customer of customers) {
        const shouldBeVip =
          Number(customer.lifetimeSpend) >= VIP_LIFETIME_SPEND_THRESHOLD;
        const shouldBeLapsed =
          !customer.lastVisitAt || customer.lastVisitAt < lapsedCutoff;

        // MySQL migration: `tags` is a JSON column now (`Prisma.JsonValue`), not a native array —
        // read it as `string[]` explicitly.
        const currentTags = (customer.tags as string[] | null) ?? [];
        const newlyLapsed = shouldBeLapsed && !currentTags.includes('Lapsed');

        let tags = currentTags;
        tags = shouldBeVip
          ? Array.from(new Set([...tags, 'VIP']))
          : tags.filter((t) => t !== 'VIP');
        tags = shouldBeLapsed
          ? Array.from(new Set([...tags, 'Lapsed']))
          : tags.filter((t) => t !== 'Lapsed');

        if (
          tags.length !== currentTags.length ||
          tags.some((t, i) => t !== currentTags[i])
        ) {
          await this.prisma.customer.update({
            where: { id: customer.id },
            data: { tags },
          });
        }

        // Automations engine (UPD-BE-028) lapsed_customer trigger — only on the transition into
        // Lapsed, not every hourly tick a customer remains lapsed.
        if (newlyLapsed) {
          const event = await this.prisma.activityEvent.create({
            data: {
              businessId: business.id,
              type: ActivityEventType.customer_lapsed,
              description: `${customer.name} hasn't visited in ${LAPSED_DAYS}+ days`,
              entityType: 'Customer',
              entityId: customer.id,
            },
          });
          void this.workflowTrigger
            .dispatch(business.id, event.type, {
              description: event.description,
              entityType: event.entityType,
              entityId: event.entityId,
            })
            .catch((error: Error) =>
              this.logger.warn(
                `Workflow dispatch failed for customer_lapsed event ${event.id}: ${error.message}`,
              ),
            );
        }
      }
    }

    this.logger.debug(
      `Tag rules evaluated for ${businesses.length} business(es)`,
    );
  }

  async runBirthdayGreetings(now: Date = new Date()): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true, name: true, timezone: true },
    });

    for (const business of businesses) {
      if (
        this.locale.currentLocalTime(business.timezone, now).slice(0, 2) !==
        BIRTHDAY_LOCAL_HOUR
      )
        continue;

      const todayMonth = now.getUTCMonth() + 1;
      const todayDay = now.getUTCDate();

      const customers = await this.prisma.customer.findMany({
        where: {
          businessId: business.id,
          birthday: { not: null },
          optedOut: false,
          consentMarketing: true,
        },
      });

      for (const customer of customers) {
        if (!customer.birthday) continue;
        const bMonth = customer.birthday.getUTCMonth() + 1;
        const bDay = customer.birthday.getUTCDate();
        if (bMonth !== todayMonth || bDay !== todayDay) continue;

        await this.sendGate
          .send({
            businessId: business.id,
            customerId: customer.id,
            templateKey: 'birthday',
            variables: {
              customerName: customer.name,
              businessName: business.name,
            },
          })
          .catch(() => undefined);

        // Automations engine (UPD-BE-028) birthday trigger — recorded regardless of whether the
        // built-in greeting send above succeeded, since it's a real fact about the customer.
        const event = await this.prisma.activityEvent.create({
          data: {
            businessId: business.id,
            type: ActivityEventType.birthday,
            description: `${customer.name}'s birthday`,
            entityType: 'Customer',
            entityId: customer.id,
          },
        });
        void this.workflowTrigger
          .dispatch(business.id, event.type, {
            description: event.description,
            entityType: event.entityType,
            entityId: event.entityId,
          })
          .catch((error: Error) =>
            this.logger.warn(
              `Workflow dispatch failed for birthday event ${event.id}: ${error.message}`,
            ),
          );
      }
    }

    this.logger.debug(
      `Birthday greetings evaluated for ${businesses.length} business(es)`,
    );
  }
}
