import { BadRequestException } from '@nestjs/common';
import { SocialPlatform } from '../../generated/prisma';

/** Same "validate the route param against the real enum" convention as `IntegrationsController.parseProvider`. */
export function parseSocialPlatform(value: string): SocialPlatform {
  if (!(Object.values(SocialPlatform) as string[]).includes(value)) {
    throw new BadRequestException(`Unknown social platform: ${value}`);
  }
  return value as SocialPlatform;
}
