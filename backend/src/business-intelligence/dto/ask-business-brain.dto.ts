import { IsString, Length } from 'class-validator';

export class AskBusinessBrainDto {
  @IsString()
  @Length(3, 500)
  question!: string;
}
