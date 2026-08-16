import { IsString } from 'class-validator';

export class EnrollLoyaltyMemberDto {
  @IsString()
  customerId!: string;
}
