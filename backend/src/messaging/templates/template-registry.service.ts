import { Injectable } from '@nestjs/common';
import { TEMPLATE_REGISTRY } from './template-registry.data';
import { RenderedTemplate, TemplateDefinition } from './template.types';

const DEFAULT_LOCALE = 'en';

/** `{{var}}` substitution shared between registry-rendered text and a business's own custom
 * message text (UPD-BE-092 fix-it) — the same variable syntax works either way. */
export function substituteTemplateVariables(
  text: string,
  variables: Record<string, string>,
): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    (_match, name: string) => variables[name] ?? '',
  );
}

/**
 * Template registry keyed by (template_key, locale) — BE-020. Backs the send
 * gate's "template exists" check and renders the final message body.
 */
@Injectable()
export class TemplateRegistryService {
  get(templateKey: string): TemplateDefinition | undefined {
    return TEMPLATE_REGISTRY[templateKey];
  }

  /** True if the key exists for the exact locale or has an `en` fallback. */
  exists(templateKey: string, locale: string): boolean {
    const def = this.get(templateKey);
    return !!def && !!(def.locales[locale] ?? def.locales[DEFAULT_LOCALE]);
  }

  render(
    templateKey: string,
    locale: string,
    variables: Record<string, string>,
  ): RenderedTemplate {
    const def = this.get(templateKey);
    if (!def) {
      throw new Error(`Unknown template key: ${templateKey}`);
    }

    const resolvedLocale = def.locales[locale] ? locale : DEFAULT_LOCALE;
    const body = def.locales[resolvedLocale];
    if (!body) {
      throw new Error(
        `No "${resolvedLocale}" (or "${DEFAULT_LOCALE}") copy for template: ${templateKey}`,
      );
    }

    return {
      text: substituteTemplateVariables(body, variables),
      category: def.category,
      locale: resolvedLocale,
    };
  }
}
