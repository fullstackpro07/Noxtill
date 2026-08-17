import { IsString } from 'class-validator';

export class ReplyInboxItemDto {
  @IsString()
  text!: string;
}
