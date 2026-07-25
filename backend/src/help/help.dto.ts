import { IsString, MinLength } from 'class-validator';

export class AskHelpDto {
  @IsString()
  @MinLength(3)
  question!: string;
}
