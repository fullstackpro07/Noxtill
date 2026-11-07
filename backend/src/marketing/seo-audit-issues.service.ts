import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, SeoAuditIssueStatus } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type {
  SeoAuditIssue as CrawledSeoAuditIssue,
  SeoAuditPage,
} from './seo-site-audit.util';

const INVALID_ISSUE_STATE = 'SEO_AUDIT_ISSUE_STATE_INVALID';
const ISSUE_NOT_FOUND = 'SEO_AUDIT_ISSUE_NOT_FOUND';
const ISSUE_DECISION_CONFLICT = 'SEO_AUDIT_ISSUE_DECISION_CONFLICT';
const ISSUE_REASON_REQUIRED = 'SEO_AUDIT_ISSUE_REASON_REQUIRED';

const SEVERITY_RANK: Record<CrawledSeoAuditIssue['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type AuditStatus = 'running' | 'completed' | 'partial' | 'failed';

@Injectable()
export class SeoAuditIssuesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(
    businessId: string,
    status: SeoAuditIssueStatus = SeoAuditIssueStatus.open,
  ) {
    if (!Object.values(SeoAuditIssueStatus).includes(status)) {
      throw new AppException(
        INVALID_ISSUE_STATE,
        'Unsupported SEO issue status.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenantPrisma.client.seoAuditIssue.findMany({
      where: { businessId, status },
      include: {
        auditEvents: {
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 10,
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });
  }

  async hasRecordedIssuesForSite(
    businessId: string,
    siteUrl: string,
  ): Promise<boolean> {
    const siteHost = this.normalizedHost(siteUrl);
    if (!siteHost) return false;
    const count = await this.tenantPrisma.client.seoAuditIssue.count({
      where: { businessId, siteHost },
    });
    return count > 0;
  }

  /**
   * Merge a completed/partial bounded crawl into the tenant's issue history.
   * Findings disappear only when their page was fetched successfully in this run.
   */
  async syncFromAudit(input: {
    businessId: string;
    auditRunId: string;
    siteUrl: string;
    status: AuditStatus;
    pages: SeoAuditPage[];
    issues: CrawledSeoAuditIssue[];
    observedAt?: Date;
  }): Promise<{ newlyDetectedHighPriorityCount: number }> {
    if (input.status !== 'completed' && input.status !== 'partial') {
      return { newlyDetectedHighPriorityCount: 0 };
    }

    const siteHost = this.normalizedHost(input.siteUrl);
    if (!siteHost) return { newlyDetectedHighPriorityCount: 0 };

    const pageKeys = new Set<string>();
    for (const page of input.pages) {
      const requestedKey = this.pageKey(page.url, siteHost);
      const finalKey = this.pageKey(page.finalUrl, siteHost);
      if (requestedKey) pageKeys.add(requestedKey);
      if (finalKey) pageKeys.add(finalKey);
    }
    if (pageKeys.size === 0) return { newlyDetectedHighPriorityCount: 0 };

    const crawledIssues = new Map<
      string,
      { fingerprint: string; issue: CrawledSeoAuditIssue; pageKey: string }
    >();
    for (const issue of input.issues) {
      const pageKey = this.pageKey(issue.url, siteHost);
      if (!pageKey || !pageKeys.has(pageKey)) continue;
      const fingerprint = this.fingerprint(siteHost, pageKey, issue.type);
      const prior = crawledIssues.get(fingerprint);
      if (
        !prior ||
        SEVERITY_RANK[issue.severity] < SEVERITY_RANK[prior.issue.severity]
      ) {
        crawledIssues.set(fingerprint, { fingerprint, issue, pageKey });
      }
    }

    const observed = [...crawledIssues.values()];
    const fingerprints = observed.map((entry) => entry.fingerprint);
    const now = input.observedAt ?? new Date();

    const newlyDetectedHighPriorityCount =
      await this.tenantPrisma.client.$transaction(async (tx) => {
        let detectedCount = 0;
        const existingRows = fingerprints.length
          ? await tx.seoAuditIssue.findMany({
              where: {
                businessId: input.businessId,
                siteHost,
                fingerprint: { in: fingerprints },
              },
            })
          : [];
        const existingByFingerprint = new Map(
          existingRows.map((row) => [row.fingerprint, row]),
        );

        for (const entry of observed) {
          const existing = existingByFingerprint.get(entry.fingerprint);
          if (!existing) {
            const created = await tx.seoAuditIssue.create({
              data: {
                businessId: input.businessId,
                siteHost,
                fingerprint: entry.fingerprint,
                type: entry.issue.type,
                severity: entry.issue.severity,
                pageUrl: entry.issue.url,
                evidence: entry.issue.evidence,
                recommendation: entry.issue.recommendation,
                firstSeenAt: now,
                lastSeenAt: now,
                lastSeenAuditRunId: input.auditRunId,
              },
            });
            await tx.seoAuditIssueAudit.create({
              data: {
                businessId: input.businessId,
                issueId: created.id,
                auditRunId: input.auditRunId,
                action: 'detected',
                after: this.snapshot(created),
              },
            });
            if (
              entry.issue.severity === 'critical' ||
              entry.issue.severity === 'high'
            ) {
              detectedCount += 1;
            }
            continue;
          }

          const wasResolved = existing.status === SeoAuditIssueStatus.resolved;
          const changed = await tx.seoAuditIssue.updateMany({
            where: {
              id: existing.id,
              businessId: input.businessId,
              status: existing.status,
            },
            data: {
              type: entry.issue.type,
              severity: entry.issue.severity,
              pageUrl: entry.issue.url,
              evidence: entry.issue.evidence,
              recommendation: entry.issue.recommendation,
              lastSeenAt: now,
              lastSeenAuditRunId: input.auditRunId,
              ...(wasResolved
                ? {
                    status: SeoAuditIssueStatus.open,
                    resolvedAt: null,
                    ignoredAt: null,
                    ignoreReason: null,
                    decidedByUserId: null,
                  }
                : {}),
            },
          });
          const reopened = changed.count === 1 && wasResolved;
          if (
            reopened &&
            (entry.issue.severity === 'critical' ||
              entry.issue.severity === 'high')
          ) {
            detectedCount += 1;
          }
          const updated = await tx.seoAuditIssue.findFirstOrThrow({
            where: { id: existing.id, businessId: input.businessId },
          });
          await tx.seoAuditIssueAudit.create({
            data: {
              businessId: input.businessId,
              issueId: existing.id,
              auditRunId: input.auditRunId,
              action: reopened ? 'reopened' : 'observed',
              reason: reopened
                ? 'The finding was detected again by a website audit.'
                : null,
              before: reopened ? this.snapshot(existing) : undefined,
              after: this.snapshot(updated),
            },
          });
        }

        const openIssues = await tx.seoAuditIssue.findMany({
          where: {
            businessId: input.businessId,
            siteHost,
            status: SeoAuditIssueStatus.open,
          },
        });
        const resolved = openIssues.filter((row) => {
          const key = this.pageKey(row.pageUrl, siteHost);
          if (!key || !pageKeys.has(key)) return false;
          // Duplicate-title evidence depends on a set of pages. The bounded crawler cannot
          // prove it absent from the whole site, so keep it open rather than claim a fix.
          if (row.type === 'duplicate_title') return false;
          return !crawledIssues.has(row.fingerprint);
        });
        for (const row of resolved) {
          const changed = await tx.seoAuditIssue.updateMany({
            where: {
              id: row.id,
              businessId: input.businessId,
              status: SeoAuditIssueStatus.open,
            },
            data: {
              status: SeoAuditIssueStatus.resolved,
              resolvedAt: now,
            },
          });
          if (changed.count !== 1) continue;
          await tx.seoAuditIssueAudit.create({
            data: {
              businessId: input.businessId,
              issueId: row.id,
              auditRunId: input.auditRunId,
              action: 'resolved_by_audit',
              reason:
                'The page was fetched successfully and this finding was not observed.',
              before: this.snapshot(row),
              after: this.snapshot({
                ...row,
                status: SeoAuditIssueStatus.resolved,
                resolvedAt: now,
              }),
            },
          });
        }
        return detectedCount;
      });
    return { newlyDetectedHighPriorityCount };
  }

  async ignore(user: AuthenticatedUser, issueId: string, reasonInput: string) {
    const reason = this.cleanReason(reasonInput);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const issue = await this.findIssue(user.businessId, issueId, tx);
      if (issue.status !== SeoAuditIssueStatus.open) {
        throw this.decisionConflict();
      }

      const now = new Date();
      const changed = await tx.seoAuditIssue.updateMany({
        where: {
          id: issue.id,
          businessId: user.businessId,
          status: SeoAuditIssueStatus.open,
        },
        data: {
          status: SeoAuditIssueStatus.ignored,
          ignoredAt: now,
          ignoreReason: reason,
          decidedByUserId: user.sub,
        },
      });
      if (changed.count !== 1) throw this.decisionConflict();

      const updated = await tx.seoAuditIssue.findFirstOrThrow({
        where: { id: issue.id, businessId: user.businessId },
      });
      await tx.seoAuditIssueAudit.create({
        data: {
          businessId: user.businessId,
          issueId: issue.id,
          action: 'ignored',
          reason,
          actorUserId: user.sub,
          before: this.snapshot(issue),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  async reopen(user: AuthenticatedUser, issueId: string, reasonInput: string) {
    const reason = this.cleanReason(reasonInput);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const issue = await this.findIssue(user.businessId, issueId, tx);
      if (issue.status === SeoAuditIssueStatus.open) {
        throw this.decisionConflict();
      }

      const changed = await tx.seoAuditIssue.updateMany({
        where: {
          id: issue.id,
          businessId: user.businessId,
          status: issue.status,
        },
        data: {
          status: SeoAuditIssueStatus.open,
          resolvedAt: null,
          ignoredAt: null,
          ignoreReason: null,
          decidedByUserId: user.sub,
        },
      });
      if (changed.count !== 1) throw this.decisionConflict();

      const updated = await tx.seoAuditIssue.findFirstOrThrow({
        where: { id: issue.id, businessId: user.businessId },
      });
      await tx.seoAuditIssueAudit.create({
        data: {
          businessId: user.businessId,
          issueId: issue.id,
          action: 'reopened_by_user',
          reason,
          actorUserId: user.sub,
          before: this.snapshot(issue),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  private async findIssue(
    businessId: string,
    issueId: string,
    client: Pick<typeof this.tenantPrisma.client, 'seoAuditIssue'> = this
      .tenantPrisma.client,
  ) {
    const issue = await client.seoAuditIssue.findFirst({
      where: { id: issueId, businessId },
    });
    if (!issue) {
      throw new AppException(
        ISSUE_NOT_FOUND,
        'SEO audit issue not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return issue;
  }

  private cleanReason(value: string): string {
    const reason = value.trim();
    if (reason.length < 3 || reason.length > 1000) {
      throw new AppException(
        ISSUE_REASON_REQUIRED,
        'Enter a reason between 3 and 1000 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return reason;
  }

  private decisionConflict() {
    return new AppException(
      ISSUE_DECISION_CONFLICT,
      'This SEO issue has already changed state. Refresh the issue list and try again.',
      HttpStatus.CONFLICT,
    );
  }

  private normalizedHost(input: string): string | null {
    try {
      return new URL(input).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  private pageKey(input: string, siteHost: string): string | null {
    try {
      const url = new URL(input);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== siteHost) return null;
      const pathname =
        url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
      return `${host}${pathname}`;
    } catch {
      return null;
    }
  }

  private fingerprint(siteHost: string, pageKey: string, type: string): string {
    return createHash('sha256')
      .update(`${siteHost}\u0000${pageKey}\u0000${type}`)
      .digest('hex');
  }

  private snapshot(value: {
    id: string;
    status: SeoAuditIssueStatus;
    severity: string;
    pageUrl: string;
    evidence: string;
    recommendation: string;
    resolvedAt: Date | null;
    ignoredAt: Date | null;
    ignoreReason: string | null;
  }): Prisma.InputJsonObject {
    return {
      id: value.id,
      status: value.status,
      severity: value.severity,
      pageUrl: value.pageUrl,
      evidence: value.evidence,
      recommendation: value.recommendation,
      resolvedAt: value.resolvedAt?.toISOString() ?? null,
      ignoredAt: value.ignoredAt?.toISOString() ?? null,
      ignoreReason: value.ignoreReason,
    };
  }
}
