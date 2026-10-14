import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  emailOrPhone!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Unticked "Remember me" shortens the refresh window to one day. */
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
