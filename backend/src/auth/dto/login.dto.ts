import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(191)
  emailOrPhone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  /** Unticked "Remember me" = shared device: 15-minute idle, 12-hour absolute session (§8.5). */
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  /** Cloudflare Turnstile token (required only when TURNSTILE_SECRET_KEY is configured). */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}
