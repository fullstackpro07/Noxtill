import { IsObject, IsOptional } from 'class-validator';

export class ConfirmVoiceCommandDto {
  /** Lets the caller hand-correct a misheard field (e.g. quantity) before it's actually written — merged over the parsed args. */
  @IsOptional()
  @IsObject()
  argsOverride?: Record<string, unknown>;
}
