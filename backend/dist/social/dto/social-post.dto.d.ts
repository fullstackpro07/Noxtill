import { SocialPlatform } from '../../../generated/prisma';
export declare class CreateSocialPostDto {
    caption: string;
    mediaKeys?: string[];
    platforms: SocialPlatform[];
    scheduledFor?: string;
}
