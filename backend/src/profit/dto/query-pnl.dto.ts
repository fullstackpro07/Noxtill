import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const PNL_PERIODS = ['today', 'week', 'month', 'quarter', 'year'] as const;
export type PnlPeriod = (typeof PNL_PERIODS)[number];

export class QueryPnlDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  /** Profit Overview's Period filter (UPD-BE-112b) — defaults to the calendar month above. */
  @IsOptional()
  @IsIn(PNL_PERIODS)
  period?: PnlPeriod;

  /** UPD-BE-114 — omitted means just this business, "all" means the caller's whole real branch group, a specific id means one validated sibling branch (see `BranchScopeService`). */
  @IsOptional()
  @IsString()
  branchId?: string;
}
