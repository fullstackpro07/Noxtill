import { Injectable } from '@nestjs/common';
import {
  SeoAuditIssueStatus,
  SeoContentBriefStatus,
  SeoContentRevisionStatus,
  SeoTechnicalActionStatus,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const WORKSPACE_RULES = {
  newFindingDays: 7,
  completedDays: 30,
} as const;

export type WorkspaceStage =
  | 'new'
  | 'draft_ready'
  | 'waiting_approval'
  | 'ready_to_apply'
  | 'verification_required'
  | 'not_matched'
  | 'completed';

export type WorkspaceKind =
  'audit_finding' | 'page_revision' | 'technical_change' | 'content';

export interface WorkspaceItem {
  key: string;
  kind: WorkspaceKind;
  id: string;
  action: string;
  entity: string;
  reason: string | null;
  risk: 'low' | 'medium' | 'high';
  /** Who produced the proposal — shown instead of an invented confidence score. */
  origin: string;
  stage: WorkspaceStage;
  status: string;
  verificationNote: string | null;
  ownerUserId: string | null;
  updatedAt: Date;
  href: string;
}

const REVISION_STAGE: Partial<
  Record<SeoContentRevisionStatus, WorkspaceStage>
> = {
  draft: 'draft_ready',
  approval_required: 'waiting_approval',
  approved: 'ready_to_apply',
  applied: 'verification_required',
  verified: 'completed',
};
const TECHNICAL_STAGE: Partial<
  Record<SeoTechnicalActionStatus, WorkspaceStage>
> = {
  draft: 'draft_ready',
  approval_required: 'waiting_approval',
  approved: 'ready_to_apply',
  applied: 'verification_required',
  verified: 'completed',
};

const ORIGIN: Record<string, string> = {
  ai: 'AI draft — review before approving',
  ai_edited: 'AI draft, edited by your team',
  manual: 'Written by your team',
  restore: 'Restored from an earlier version',
  crawler: 'Found by the site audit',
};

/**
 * SEO Agent Workspace (SEO Autopilot screen 14) — one queue over the SEO action records that
 * already exist (site-audit findings, On-Page revisions, Technical changes, Content briefs), grouped
 * by where each one is in draft → approval → apply → verify. It adds no state of its own: approve /
 * reject call the owning screen's API, so every rule and audit trail stays in one place. Noxtill
 * doesn't publish to the merchant's site, so "executing" is the merchant applying an approved change;
 * expected traffic impact is not estimated (no Search Console / analytics data).
 */
@Injectable()
export class SeoAgentWorkspaceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async queue(businessId: string, now = new Date()) {
    const newSince = new Date(
      now.getTime() - WORKSPACE_RULES.newFindingDays * DAY_MS,
    );
    const doneSince = new Date(
      now.getTime() - WORKSPACE_RULES.completedDays * DAY_MS,
    );
    const [findings, revisions, technical, briefs] = await Promise.all([
      this.db.seoAuditIssue.findMany({
        where: {
          businessId,
          status: SeoAuditIssueStatus.open,
          firstSeenAt: { gte: newSince },
        },
        orderBy: [{ firstSeenAt: 'desc' }],
        take: 200,
      }),
      this.db.seoContentRevision.findMany({
        where: {
          businessId,
          OR: [
            {
              status: {
                in: [
                  SeoContentRevisionStatus.draft,
                  SeoContentRevisionStatus.approval_required,
                  SeoContentRevisionStatus.approved,
                  SeoContentRevisionStatus.applied,
                ],
              },
            },
            {
              status: SeoContentRevisionStatus.verified,
              verifiedAt: { gte: doneSince },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
      }),
      this.db.seoTechnicalAction.findMany({
        where: {
          businessId,
          OR: [
            {
              status: {
                in: [
                  SeoTechnicalActionStatus.draft,
                  SeoTechnicalActionStatus.approval_required,
                  SeoTechnicalActionStatus.approved,
                  SeoTechnicalActionStatus.applied,
                ],
              },
            },
            {
              status: SeoTechnicalActionStatus.verified,
              verifiedAt: { gte: doneSince },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
      }),
      this.db.seoContentBrief.findMany({
        where: {
          businessId,
          OR: [
            {
              status: {
                in: [
                  SeoContentBriefStatus.drafting,
                  SeoContentBriefStatus.approval_required,
                  SeoContentBriefStatus.approved,
                ],
              },
            },
            {
              status: SeoContentBriefStatus.published,
              OR: [
                { liveConfirmedAt: null },
                { liveConfirmedAt: { gte: doneSince } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
      }),
    ]);

    const items: WorkspaceItem[] = [];
    for (const issue of findings) {
      items.push({
        key: `audit_finding:${issue.id}`,
        kind: 'audit_finding',
        id: issue.id,
        action: issue.type.replaceAll('_', ' '),
        entity: issue.pageUrl,
        reason: issue.evidence,
        risk:
          issue.severity === 'high'
            ? 'high'
            : issue.severity === 'medium'
              ? 'medium'
              : 'low',
        origin: ORIGIN.crawler,
        stage: 'new',
        status: 'open',
        verificationNote: null,
        ownerUserId: null,
        updatedAt: issue.lastSeenAt,
        href: '/marketing/seo-autopilot',
      });
    }
    for (const revision of revisions) {
      const stage = REVISION_STAGE[revision.status];
      if (!stage) continue;
      const verification = revision.verification as {
        fields?: Record<string, string>;
        pageFound?: boolean;
      } | null;
      const mismatched =
        revision.status === SeoContentRevisionStatus.applied &&
        verification &&
        (verification.pageFound === false ||
          Object.values(verification.fields ?? {}).includes('mismatch'));
      items.push({
        key: `page_revision:${revision.id}`,
        kind: 'page_revision',
        id: revision.id,
        action: `Page metadata v${revision.version}`,
        entity: revision.pageUrl,
        reason: revision.rationale,
        risk: 'low',
        origin: ORIGIN[revision.source] ?? revision.source,
        stage: mismatched ? 'not_matched' : stage,
        status: revision.status,
        verificationNote: mismatched
          ? verification.pageFound === false
            ? 'The page was not in the latest site audit.'
            : `Latest audit: ${Object.entries(verification.fields ?? {})
                .map(
                  ([field, result]) => `${field} ${result.replace('_', ' ')}`,
                )
                .join(', ')}`
          : null,
        ownerUserId: revision.createdByUserId,
        updatedAt: revision.updatedAt,
        href: '/marketing/seo-autopilot/on-page',
      });
    }
    for (const action of technical) {
      const stage = TECHNICAL_STAGE[action.status];
      if (!stage) continue;
      const verification = action.verification as {
        result?: string;
        observed?: unknown;
      } | null;
      const mismatched =
        action.status === SeoTechnicalActionStatus.applied &&
        verification?.result === 'mismatch';
      items.push({
        key: `technical_change:${action.id}`,
        kind: 'technical_change',
        id: action.id,
        action: `${action.type} change`,
        entity: action.targetValue
          ? `${action.sourceUrl} → ${action.targetValue}`
          : action.sourceUrl,
        reason: action.description,
        risk:
          action.risk === 'high'
            ? 'high'
            : action.risk === 'medium'
              ? 'medium'
              : 'low',
        origin: ORIGIN.manual,
        stage: mismatched ? 'not_matched' : stage,
        status: action.status,
        verificationNote: mismatched
          ? `Latest audit saw ${JSON.stringify(verification?.observed ?? null)}.`
          : verification?.result === 'not_verifiable'
            ? 'The site audit cannot check this kind of change — confirm it on your server.'
            : null,
        ownerUserId: action.createdByUserId,
        updatedAt: action.updatedAt,
        href: '/marketing/seo-autopilot/technical',
      });
    }
    for (const brief of briefs) {
      const stage: WorkspaceStage =
        brief.status === SeoContentBriefStatus.drafting
          ? 'draft_ready'
          : brief.status === SeoContentBriefStatus.approval_required
            ? 'waiting_approval'
            : brief.status === SeoContentBriefStatus.approved
              ? 'ready_to_apply'
              : brief.liveConfirmedAt
                ? 'completed'
                : 'verification_required';
      items.push({
        key: `content:${brief.id}`,
        kind: 'content',
        id: brief.id,
        action: `Content: ${brief.format.replaceAll('_', ' ')}`,
        entity: brief.publishedUrl ?? brief.draftTitle ?? brief.topic,
        reason:
          brief.strategyNote ??
          (brief.keywordText ? `Targets “${brief.keywordText}”` : null),
        risk: 'low',
        origin: ORIGIN[brief.draftSource ?? brief.briefSource] ?? ORIGIN.manual,
        stage,
        status: brief.status,
        verificationNote:
          stage === 'verification_required'
            ? 'Waiting for a site audit to find the published URL.'
            : null,
        ownerUserId: brief.assigneeUserId ?? brief.createdByUserId,
        updatedAt: brief.updatedAt,
        href: `/marketing/seo-autopilot/content?brief=${brief.id}`,
      });
    }
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const count = (stage: WorkspaceStage) =>
      items.filter((item) => item.stage === stage).length;
    return {
      rules: WORKSPACE_RULES,
      kpis: {
        newFindings: count('new'),
        draftReady: count('draft_ready'),
        waitingApproval: count('waiting_approval'),
        readyToApply: count('ready_to_apply'),
        verificationRequired: count('verification_required'),
        notMatched: count('not_matched'),
        completed: count('completed'),
      },
      items,
    };
  }

  /** Recent decisions across the SEO action audit trails (newest first). */
  async history(businessId: string) {
    const [revisionAudits, technicalAudits, briefAudits, issueAudits] =
      await Promise.all([
        this.db.seoContentRevisionAudit.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.db.seoTechnicalActionAudit.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.db.seoContentBriefAudit.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.db.seoAuditIssueAudit.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);
    const users = new Set(
      [...revisionAudits, ...technicalAudits, ...briefAudits, ...issueAudits]
        .map((row) => row.actorUserId)
        .filter((id): id is string => Boolean(id)),
    );
    const names = new Map(
      (
        await this.db.user.findMany({
          where: { id: { in: [...users] } },
          select: { id: true, name: true },
        })
      ).map((user) => [user.id, user.name]),
    );
    const rows = [
      ...revisionAudits.map((row) => ({
        kind: 'page_revision' as const,
        entityId: row.revisionId,
        action: row.action,
        note: row.note,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt,
      })),
      ...technicalAudits.map((row) => ({
        kind: 'technical_change' as const,
        entityId: row.actionId,
        action: row.action,
        note: row.note,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt,
      })),
      ...briefAudits.map((row) => ({
        kind: 'content' as const,
        entityId: row.briefId,
        action: row.action,
        note: row.note,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt,
      })),
      ...issueAudits.map((row) => ({
        kind: 'audit_finding' as const,
        entityId: row.issueId,
        action: row.action,
        note: row.reason ?? null,
        actorUserId: row.actorUserId ?? null,
        createdAt: row.createdAt,
      })),
    ];
    return rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 150)
      .map((row) => ({
        ...row,
        actor: row.actorUserId
          ? (names.get(row.actorUserId) ?? 'Team member')
          : 'Noxtill (automatic)',
      }));
  }
}
