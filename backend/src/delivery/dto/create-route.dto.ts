import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateRouteDto {
  @IsOptional()
  @IsString()
  riderId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  deliveryIds!: string[];
}
