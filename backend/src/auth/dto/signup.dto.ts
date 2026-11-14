import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SignupDto {
  /** Optional since the Auth & Onboarding redesign — collected in onboarding Step 2. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  businessName?: string;

  /** Optional since the Auth & Onboarding redesign — derived from the email until the owner sets it. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ValidateIf((o: SignupDto) => !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o: SignupDto) => !o.email)
  @IsString()
  phone?: string;

  /** Length (12–128), breach check and normalisation are enforced by PasswordService. */
  @IsString()
  @MaxLength(256)
  password!: string;

  /** Cloudflare Turnstile token (required only when TURNSTILE_SECRET_KEY is configured). */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
