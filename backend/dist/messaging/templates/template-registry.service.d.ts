import { RenderedTemplate, TemplateDefinition } from './template.types';
export declare class TemplateRegistryService {
    get(templateKey: string): TemplateDefinition | undefined;
    exists(templateKey: string, locale: string): boolean;
    render(templateKey: string, locale: string, variables: Record<string, string>): RenderedTemplate;
}
