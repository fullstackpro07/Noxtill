import { IsIn, IsUrl } from 'class-validator';
import { WorkflowTriggerKey } from '@prisma/client';

export class CreateDeveloperWebhookDto {
  @IsIn(Object.values(WorkflowTriggerKey))
  triggerKey!: WorkflowTriggerKey;

  @IsUrl({ require_tld: false })
  targetUrl!: string;
}
