import { IsNumber, IsString, Max, Min } from 'class-validator';

export class WhatIfDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(-20)
  @Max(20)
  priceDeltaPct!: number;
}
