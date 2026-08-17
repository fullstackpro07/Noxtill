import { MessageCategory } from '@prisma/client';

export interface TemplateDefinition {
  key: string;
  category: MessageCategory;
  /** locale -> template body with {{variable}} placeholders, already-formatted values expected. */
  locales: Record<string, string>;
}

export interface RenderedTemplate {
  text: string;
  category: MessageCategory;
  locale: string;
}
