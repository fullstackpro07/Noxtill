import { IsIn } from 'class-validator';

/** Matches the spec's exact snooze picker options — never a client-supplied absolute date. */
export class SnoozeActionItemDto {
  @IsIn(['1h', 'tomorrow', 'next_week'])
  duration!: '1h' | 'tomorrow' | 'next_week';
}
