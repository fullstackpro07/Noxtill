import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateGmbPostDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  buttonType?: string;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class CreateGmbPhotoDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class AnswerGmbQnaDto {
  @IsString()
  answer!: string;
}

export class SelectGmbLocationDto {
  @IsString()
  locationId!: string;
}
