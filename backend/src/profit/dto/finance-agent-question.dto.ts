import { IsString, MaxLength, MinLength } from 'class-validator';

export class FinanceAgentQuestionDto {
  @IsString()
  @MinLength(4)
  @MaxLength(1_000)
  question!: string;
}
