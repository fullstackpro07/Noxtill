import { IsIn, IsOptional, IsString } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';

export class SyncAdAudienceDto {
  @IsString()
  segmentKey!: string;

  @IsIn(Object.values(IntegrationProvider))
  provider!: IntegrationProvider;

  @IsOptional()
  @IsString()
  name?: string;
}
