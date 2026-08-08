import { IsString, MinLength } from 'class-validator';

export class ReplyFeedbackDto {
  @IsString()
  @MinLength(1)
  message!: string;
}
