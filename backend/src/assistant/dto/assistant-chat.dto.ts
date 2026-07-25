import { IsString, MinLength } from 'class-validator';

export class AssistantChatDto {
  @IsString()
  @MinLength(1)
  message!: string;
}
