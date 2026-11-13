import { Matches } from 'class-validator';

export class VerifyEmailOtpDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  code!: string;
}
