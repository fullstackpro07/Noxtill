import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class EmailDto {
  @IsEmail()
  @MaxLength(191)
  email!: string;

  /** Cloudflare Turnstile token (password reset request; only when configured). */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}

export class TokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  currentPassword?: string;

  @IsString()
  @MaxLength(256)
  newPassword!: string;
}
