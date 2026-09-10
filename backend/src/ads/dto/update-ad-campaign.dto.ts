import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

/** Campaign management actions (UPD-BE-130) — pause/resume/budget-adjust; nothing else is editable through this route. */
export class UpdateAdCampaignDto {
  @IsOptional()
  @IsIn(['paused', 'active'])
  status?: 'paused' | 'active';

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyBudget?: number;
}
