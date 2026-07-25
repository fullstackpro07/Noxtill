import { IsString } from 'class-validator';

export class RedeemReferralDto {
  /** The referring customer's own referral code — their customer id. */
  @IsString()
  code!: string;

  @IsString()
  refereePhone!: string;

  @IsString()
  refereeName!: string;
}
