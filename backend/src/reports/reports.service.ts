import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ReportRunsService, ReportTrigger } from './report-runs.service';
import { ReportKind } from './reports.types';

/**
 * Entry point other modules (and the controller) use to generate a report. Everything real lives
 * in `ReportBuildersService` (computing + validating), `ReportRunsService` (recording, library,
 * delivery) and `TaxReportsService`; this only translates an authenticated caller into "generate
 * this report for the business they are currently acting as".
 */
@Injectable()
export class ReportsService {
  constructor(private readonly runs: ReportRunsService) {}

  generate(
    kind: ReportKind,
    month: string | undefined,
    authUser: AuthenticatedUser,
    trigger?: ReportTrigger,
  ) {
    return this.runs.generate({
      // Branch-aware: the business `X-Branch` resolved to, else the caller's home business.
      businessId: this.runs.activeBusinessId(authUser.businessId),
      kind,
      month,
      actor: {
        userId: authUser.sub,
        role: authUser.role,
        membershipBusinessId: authUser.businessId,
      },
      trigger,
    });
  }
}
