import { IsString, Length } from 'class-validator';

export class ResolveBiDiagnosisHypothesisDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
