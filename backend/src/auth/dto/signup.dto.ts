import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  businessName!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @ValidateIf((o: SignupDto) => !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o: SignupDto) => !o.email)
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;

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
