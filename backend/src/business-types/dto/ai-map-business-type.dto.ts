import { IsString, MinLength } from 'class-validator';

export class AiMapBusinessTypeDto {
  @IsString()
  @MinLength(2)
  description!: string;
}
