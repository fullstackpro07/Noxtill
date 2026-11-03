import { BiTwinAssumptionKey, BiTwinEntityType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateBiTwinAssumptionDto {
  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @IsEnum(BiTwinEntityType)
  entityType!: BiTwinEntityType;

  @IsUUID()
  entityId!: string;

  @IsEnum(BiTwinAssumptionKey)
  assumptionKey!: BiTwinAssumptionKey;

  @IsNumber({ maxDecimalPlaces: 4 })
  value!: number;

  @IsString()
  @Length(3, 1000)
  rationale!: string;
}
