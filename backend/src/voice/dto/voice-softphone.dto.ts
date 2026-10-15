import { IsBoolean } from 'class-validator';

export class VoiceSoftphoneHoldDto {
  @IsBoolean()
  hold!: boolean;
}
