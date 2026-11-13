import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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
