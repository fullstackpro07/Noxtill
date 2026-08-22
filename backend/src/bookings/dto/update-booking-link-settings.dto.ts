import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateBookingLinkSettingsDto {
  @IsOptional()
  @IsString()
  welcomeText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleServiceIds?: string[];

  @IsOptional()
  @IsString()
  brandColor?: string;
}
