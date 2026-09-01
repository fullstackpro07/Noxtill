import { IsIn, IsOptional, IsString } from 'class-validator';
import { TEMPLATE_APPROVAL_STATUSES } from '../messaging-channels.constants';

export class SetTemplateApprovalDto {
  @IsIn(TEMPLATE_APPROVAL_STATUSES)
  status!: (typeof TEMPLATE_APPROVAL_STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
