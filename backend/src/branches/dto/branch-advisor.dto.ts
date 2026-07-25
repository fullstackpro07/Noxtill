import { IsString, MinLength } from 'class-validator';

export class BranchAdvisorDto {
  @IsString()
  @MinLength(3)
  question!: string;
}
