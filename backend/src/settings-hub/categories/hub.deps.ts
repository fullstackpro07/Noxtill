import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SessionsService } from '../../auth/sessions.service';
import { SystemRoleOverridesService } from '../../roles/system-role-overrides.service';
import { S3Service } from '../../common/storage/s3.service';
import { PoliciesService } from '../../common/policies/policies.service';
import { HubCtx } from '../hub.core';

export interface QueueSnapshot {
  configured: boolean;
  reachable: boolean;
  queues: { name: string; waiting: number; active: number; completed: number; failed: number; delayed: number }[];
}

export interface HubDeps {
  prisma: PrismaService;
  notifications: NotificationsService;
  sessions: SessionsService;
  roles: SystemRoleOverridesService;
  s3: S3Service;
  policies: PoliciesService;
  queueSnapshot: () => Promise<QueueSnapshot>;
}

export const asJson = (v: unknown) => v as Prisma.InputJsonValue;

export async function business(deps: HubDeps, ctx: HubCtx) {
  return deps.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
}

export async function updateBusiness(
  deps: HubDeps,
  ctx: HubCtx,
  data: Prisma.BusinessUpdateInput,
) {
  await deps.prisma.business.update({ where: { id: ctx.businessId }, data });
}

export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export function timezones(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  return fn ? fn('timeZone') : ['UTC'];
}

export function currencies(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  return fn ? fn('currency') : ['USD'];
}

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ar', label: 'Arabic' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'hi', label: 'Hindi' },
];

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
