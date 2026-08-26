import { IsString, MaxLength, MinLength } from 'class-validator';

export class MessageAtRiskDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  offerText!: string;
}
