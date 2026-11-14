import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

export class OAuthExchangeDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  code!: string;
}

export class OAuthCompleteDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  ticket!: string;

  @IsEmail()
  @MaxLength(191)
  email!: string;
}

/** Fresh-authentication fallback: the current password, when the session isn't recent. */
export class ConfirmPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

export class PasskeyRegisterVerifyDto {
  @IsUUID()
  challengeId!: string;

  @IsObject()
  response!: RegistrationResponseJSON;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;
}

export class PasskeyAuthVerifyDto {
  @IsUUID()
  challengeId!: string;

  @IsObject()
  response!: AuthenticationResponseJSON;
}

export class RenamePasskeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  label!: string;
}

export class OAuthConfirmLinkDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  ticket!: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  code!: string;
}

/** Second step of a password sign-in on a new device. */
export class LoginDeviceDto {
  @IsString()
  @MaxLength(2000)
  ticket!: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  code!: string;
}

/** Second factor: an authenticator-app code or a recovery code. */
export class LoginMfaDto {
  @IsString()
  @MaxLength(2000)
  ticket!: string;

  @IsOptional()
  @Matches(/^\d{6}$/, {
    message: 'Enter the 6-digit code from your authenticator app.',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

export class StepUpDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

export class TotpConfirmDto {
  @Matches(/^\d{6}$/, {
    message: 'Enter the 6-digit code from your authenticator app.',
  })
  code!: string;
}

/** Passkey options for the MFA stage of a sign-in (ticket) — absent for usernameless sign-in. */
export class PasskeyOptionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ticket?: string;
}

export class PasskeyMfaVerifyDto extends PasskeyAuthVerifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ticket?: string;
}

export class SignedRequestDto {
  @IsString()
  @MaxLength(8192)
  signed_request!: string;
}
