import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WebsiteDomain, WebsiteDomainStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import * as tls from 'tls';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { WEBSITE_ERRORS, WebsiteService, notFound } from './website.service';
import { safeHref } from './website-content.util';

export const VERIFICATION_PREFIX = '_noxtill-verification';
const HOSTNAME = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

export type DnsTxtResolver = (host: string) => Promise<string[][]>;
export type CertChecker = (
  host: string,
) => Promise<{ validTo: Date | null; error: string | null }>;

function checkCertificate(
  host: string,
): Promise<{ validTo: Date | null; error: string | null }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: 6000 },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const reason = socket.authorizationError;
        socket.end();
        if (!cert || !cert.valid_to)
          return resolve({
            validTo: null,
            error: 'No certificate was returned.',
          });
        const validTo = new Date(cert.valid_to);
        if (!authorized)
          return resolve({
            validTo,
            error: `Certificate is not trusted (${String(reason)}).`,
          });
        if (validTo.getTime() < Date.now())
          return resolve({ validTo, error: 'Certificate has expired.' });
        resolve({ validTo, error: null });
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ validTo: null, error: 'Timed out connecting to port 443.' });
    });
    socket.on('error', (e: Error) =>
      resolve({ validTo: null, error: e.message.slice(0, 200) }),
    );
  });
}

@Injectable()
export class WebsiteDomainsService {
  /** Overridable in tests; production uses real DNS and TLS lookups. */
  resolveTxt: DnsTxtResolver = (host) => dns.resolveTxt(host);
  certCheck: CertChecker = checkCertificate;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly website: WebsiteService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private view(d: WebsiteDomain) {
    return {
      id: d.id,
      hostname: d.hostname,
      status: d.status,
      isPrimary: d.isPrimary,
      verificationRecord: {
        type: 'TXT',
        name: `${VERIFICATION_PREFIX}.${d.hostname}`,
        value: `noxtill-verification=${d.verificationToken}`,
      },
      lastCheckedAt: d.lastCheckedAt,
      lastError: d.lastError,
      ssl: d.sslCheckedAt
        ? {
            status: d.sslError ? 'invalid' : 'valid',
            validTo: d.sslValidTo,
            error: d.sslError,
            checkedAt: d.sslCheckedAt,
          }
        : {
            status: 'not_checked',
            validTo: null,
            error: null,
            checkedAt: null,
          },
      createdAt: d.createdAt,
    };
  }

  async overview(businessId: string) {
    const site = await this.website.site(businessId);
    const business = await this.website.businessSummary(businessId);
    const [domains, redirects, deployments, failedSchedules] =
      await Promise.all([
        this.db.websiteDomain.findMany({
          where: { siteId: site.id },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        }),
        this.db.websiteRedirect.findMany({
          where: { siteId: site.id },
          orderBy: { fromPath: 'asc' },
        }),
        this.website.listDeployments(businessId),
        this.db.auditLog.count({
          where: { businessId, action: 'website.scheduled_publish.failed' },
        }),
      ]);
    const frontend =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return {
      hostedUrl: `${frontend.replace(/\/$/, '')}/site/${business.slug}`,
      domains: domains.map((d) => this.view(d)),
      redirects,
      deployments,
      failedScheduledPublishes: failedSchedules,
      maintenanceMode: site.maintenanceMode,
      customDomainRouting: {
        available: false,
        detail:
          'Verified domains are recorded and checked here, but this server does not yet route traffic for custom domains. Visitors reach the site at the hosted address until the hosting proxy is configured for the domain.',
      },
    };
  }

  async add(businessId: string, actorUserId: string, rawHostname: string) {
    const site = await this.website.site(businessId);
    const hostname = rawHostname
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');
    if (!HOSTNAME.test(hostname)) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Enter a domain like shop.example.com (no http://, paths or IP addresses).',
        HttpStatus.BAD_REQUEST,
      );
    }
    const count = await this.db.websiteDomain.count({
      where: { siteId: site.id },
    });
    if (count >= 10)
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'A site can have at most 10 domains.',
        HttpStatus.CONFLICT,
      );
    try {
      const domain = await this.db.websiteDomain.create({
        data: {
          businessId,
          siteId: site.id,
          hostname,
          verificationToken: randomBytes(16).toString('hex'),
        },
      });
      await this.website.audit(
        this.db,
        businessId,
        actorUserId,
        'website.domain.added',
        domain.id,
        null,
        { hostname },
      );
      return this.view(domain);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          WEBSITE_ERRORS.CONFLICT,
          'That domain is already connected to a site.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** Real DNS lookup of the TXT record; then a TLS handshake to report the certificate state. */
  async verify(businessId: string, actorUserId: string, domainId: string) {
    const site = await this.website.site(businessId);
    const domain = await this.db.websiteDomain.findFirst({
      where: { id: domainId, siteId: site.id },
    });
    if (!domain) notFound('Domain');
    const expected = `noxtill-verification=${domain.verificationToken}`;
    let status: WebsiteDomainStatus = WebsiteDomainStatus.failed;
    let lastError: string | null = null;
    try {
      const records = await this.resolveTxt(
        `${VERIFICATION_PREFIX}.${domain.hostname}`,
      );
      if (records.some((chunks) => chunks.join('') === expected))
        status = WebsiteDomainStatus.verified;
      else
        lastError = `TXT record found but the value doesn't match. Expected ${expected}.`;
    } catch (error) {
      const code = (error as { code?: string }).code;
      lastError =
        code === 'ENOTFOUND' || code === 'ENODATA'
          ? `No TXT record at ${VERIFICATION_PREFIX}.${domain.hostname} yet. DNS changes can take up to 48 hours.`
          : `DNS lookup failed (${code ?? 'error'}).`;
    }
    const cert =
      status === WebsiteDomainStatus.verified
        ? await this.certCheck(domain.hostname)
        : null;
    const updated = await this.db.websiteDomain.update({
      where: { id: domain.id },
      data: {
        status,
        lastError,
        lastCheckedAt: new Date(),
        ...(cert
          ? {
              sslValidTo: cert.validTo,
              sslError: cert.error,
              sslCheckedAt: new Date(),
            }
          : {}),
        ...(status !== WebsiteDomainStatus.verified
          ? { isPrimary: false }
          : {}),
      },
    });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.domain.verified',
      domain.id,
      { status: domain.status },
      { status, lastError },
    );
    return this.view(updated);
  }

  async setPrimary(businessId: string, actorUserId: string, domainId: string) {
    const site = await this.website.site(businessId);
    const domain = await this.db.websiteDomain.findFirst({
      where: { id: domainId, siteId: site.id },
    });
    if (!domain) notFound('Domain');
    if (domain.status !== WebsiteDomainStatus.verified) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'Verify the domain before making it primary.',
        HttpStatus.CONFLICT,
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.websiteDomain.updateMany({
        where: { siteId: site.id, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.websiteDomain.update({
        where: { id: domain.id },
        data: { isPrimary: true },
      });
      await this.website.audit(
        tx,
        businessId,
        actorUserId,
        'website.domain.primary_set',
        domain.id,
        null,
        { hostname: domain.hostname },
      );
    });
    return this.overview(businessId);
  }

  async remove(businessId: string, actorUserId: string, domainId: string) {
    const site = await this.website.site(businessId);
    const domain = await this.db.websiteDomain.findFirst({
      where: { id: domainId, siteId: site.id },
    });
    if (!domain) notFound('Domain');
    await this.db.websiteDomain.delete({ where: { id: domain.id } });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.domain.removed',
      domain.id,
      { hostname: domain.hostname },
      null,
    );
    return { removed: true };
  }

  async addRedirect(
    businessId: string,
    actorUserId: string,
    input: { fromPath: string; toPath: string; permanent?: boolean },
  ) {
    const site = await this.website.site(businessId);
    const fromPath = input.fromPath.trim().replace(/\/+$/, '').toLowerCase();
    if (!/^\/[a-z0-9\-._~/]{1,299}$/.test(fromPath)) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Old path must start with / and use letters, numbers, - _ . or /.',
        HttpStatus.BAD_REQUEST,
      );
    }
    let toPath: string;
    try {
      toPath = safeHref(input.toPath, 'New address', true);
    } catch (error) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (toPath.replace(/\/+$/, '').toLowerCase() === fromPath) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'A redirect cannot point to itself.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.db.websiteRedirect.findMany({
      where: { siteId: site.id },
      select: { fromPath: true, toPath: true },
    });
    if (existing.length >= 200)
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'A site can have at most 200 redirects.',
        HttpStatus.CONFLICT,
      );
    // No chains or loops: the target can't itself be redirected, and nothing may point at this source.
    if (
      existing.some(
        (r) => r.fromPath === toPath.replace(/\/+$/, '').toLowerCase(),
      )
    ) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'The new address is itself redirected. Point straight to the final address.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      existing.some(
        (r) => r.toPath.replace(/\/+$/, '').toLowerCase() === fromPath,
      )
    ) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Another redirect already points to this path, which would create a chain.',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const redirect = await this.db.websiteRedirect.create({
        data: {
          businessId,
          siteId: site.id,
          fromPath,
          toPath,
          permanent: input.permanent !== false,
        },
      });
      await this.website.audit(
        this.db,
        businessId,
        actorUserId,
        'website.redirect.added',
        redirect.id,
        null,
        { fromPath, toPath },
      );
      return redirect;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          WEBSITE_ERRORS.CONFLICT,
          'That old path already has a redirect.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async removeRedirect(
    businessId: string,
    actorUserId: string,
    redirectId: string,
  ) {
    const site = await this.website.site(businessId);
    const redirect = await this.db.websiteRedirect.findFirst({
      where: { id: redirectId, siteId: site.id },
    });
    if (!redirect) notFound('Redirect');
    await this.db.websiteRedirect.delete({ where: { id: redirect.id } });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.redirect.removed',
      redirect.id,
      { fromPath: redirect.fromPath, toPath: redirect.toPath },
      null,
    );
    return { removed: true };
  }
}
