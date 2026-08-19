import { IsIn, IsUrl } from 'class-validator';
import { IntegrationProvider, WorkflowTriggerKey } from '@prisma/client';
import { AUTOMATION_PROVIDERS } from '../automation.constants';

export class CreateOutboundWebhookDto {
  @IsIn(AUTOMATION_PROVIDERS)
  provider!: IntegrationProvider;

  @IsIn(Object.values(WorkflowTriggerKey))
  triggerKey!: WorkflowTriggerKey;

  @IsUrl({ require_tld: false })
  targetUrl!: string;
}
