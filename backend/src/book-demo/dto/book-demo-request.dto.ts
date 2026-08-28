import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Public marketing-site "Book a Demo" form submission. */
export class BookDemoRequestDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(160)
  businessName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  /** Honeypot — real visitors never fill this in; bots filling every field do. */
  @IsOptional()
  @IsString()
  website?: string;
}
