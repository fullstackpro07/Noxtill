import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ScanSeoHeatmapDto {
  @IsString()
  keyword!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  radiusKm?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(16)
  ringPoints?: number;
}
