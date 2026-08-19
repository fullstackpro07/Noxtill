import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdCampaignDto {
  @IsString()
  name!: string;

  @IsString()
  goal!: string;

  @IsNumber()
  @Min(1)
  dailyBudget!: number;

  /** Provider-specific selection context (e.g. a chosen ad account id) — see `Connector.createCampaign`'s `meta` param. */
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
