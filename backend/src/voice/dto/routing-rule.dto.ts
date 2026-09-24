import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { VoiceRoutingTrigger } from '@prisma/client';

const TRIGGERS: VoiceRoutingTrigger[] = [
  'keyword',
  'topic',
  'sentiment',
  'low_confidence',
  'after_hours',
];
/** A rule staff create can only route TO a person or a message — never a no-op "ai" action (that's simply the absence of any matching rule). */
const ACTIONS = ['take_message', 'transfer'] as const;
type CreatableAction = (typeof ACTIONS)[number];

export class CreateRoutingRuleDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsIn(TRIGGERS)
  triggerKind!: VoiceRoutingTrigger;

  /** Required for keyword/topic/sentiment triggers; ignored for low_confidence/after_hours. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  matchValue?: string | null;

  @IsIn(ACTIONS)
  action!: CreatableAction;

  /** Only meaningful when action is "transfer" — overrides the business's own transfer number for calls this rule catches. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'must be an international phone number, e.g. +15551234567',
  })
  transferNumber?: string | null;
}

export class UpdateRoutingRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(TRIGGERS)
  triggerKind?: VoiceRoutingTrigger;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  matchValue?: string | null;

  @IsOptional()
  @IsIn(ACTIONS)
  action?: CreatableAction;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'must be an international phone number, e.g. +15551234567',
  })
  transferNumber?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReorderRoutingRulesDto {
  @IsString({ each: true })
  ids!: string[];
}
