import { IsString, Length } from 'class-validator';

export class Confirm2faDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
