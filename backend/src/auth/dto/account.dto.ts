import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class EmailDto {
  @IsEmail()
  @MaxLength(191)
  email!: string;
}

export class TokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
