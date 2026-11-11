import { Type } from 'class-transformer';
import { IsInt, IsNotEmptyObject, IsObject, Min } from 'class-validator';

export class UpdateSpecialistAgentConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsObject()
  @IsNotEmptyObject()
  settings!: Record<string, unknown>;
}
