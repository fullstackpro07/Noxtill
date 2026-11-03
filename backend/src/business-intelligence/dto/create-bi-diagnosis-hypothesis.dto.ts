import { IsString, Length } from 'class-validator';

export class CreateBiDiagnosisHypothesisDto {
  @IsString()
  @Length(10, 2000)
  hypothesis!: string;
}
