import { MessageChannel } from '../../generated/prisma';
export interface ContactInfo {
    phone?: string | null;
    email?: string | null;
}
export declare function resolveChannel(preferred: MessageChannel, contact: ContactInfo): MessageChannel | undefined;
