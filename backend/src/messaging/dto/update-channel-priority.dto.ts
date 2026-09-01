import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { MESSAGE_CHANNELS } from '../messaging-channels.constants';

export class UpdateChannelPriorityDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(MESSAGE_CHANNELS, { each: true })
  priority!: (typeof MESSAGE_CHANNELS)[number][];
}
