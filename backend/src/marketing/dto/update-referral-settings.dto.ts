import { IsBoolean, IsIn, IsNumber, Min } from 'class-validator';

export class UpdateReferralSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['credit', 'discount'])
  rewardType!: 'credit' | 'discount';

  @IsNumber()
  @Min(0)
  rewardValue!: number;
}
