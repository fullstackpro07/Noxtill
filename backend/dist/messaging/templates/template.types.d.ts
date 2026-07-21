import { MessageCategory } from '../../../generated/prisma';
export interface TemplateDefinition {
    key: string;
    category: MessageCategory;
    locales: Record<string, string>;
}
export interface RenderedTemplate {
    text: string;
    category: MessageCategory;
    locale: string;
}
