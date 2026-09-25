import { IsBoolean } from 'class-validator';

export class SetLocationConsentDto {
  @IsBoolean()
  consent!: boolean;
}
