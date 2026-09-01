import { IsOptional, IsString, MinLength } from 'class-validator';

export class AssistantChatDto {
  @IsString()
  @MinLength(1)
  message!: string;

  /** Continues an existing conversation (UPD-BE-114) — omitted starts a new one. */
  @IsOptional()
  @IsString()
  conversationId?: string;
}
