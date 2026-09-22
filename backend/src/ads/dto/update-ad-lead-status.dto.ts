import { IsIn } from 'class-validator';
import { AdLeadStatus } from '@prisma/client';

export class UpdateAdLeadStatusDto {
  @IsIn(['new', 'contacted', 'converted'])
  status!: AdLeadStatus;
}
