import {
  WORKFLOW_TEMPLATES,
  buildWorkflowTemplateCatalog,
} from './workflow-template-catalog';
import { validateWorkflowDefinition } from './workflow-definition.util';

describe('workflow template catalog', () => {
  it('provides unique built-in templates with valid executable definitions', () => {
    const ids = WORKFLOW_TEMPLATES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const template of WORKFLOW_TEMPLATES) {
      expect(
        validateWorkflowDefinition(
          template.triggerKey,
          template.name,
          template.conditions,
          template.actions,
        ),
      ).toBeNull();
      expect(template.requiredSetup.length).toBeGreaterThan(0);
      expect(template.testFixture.expectedMessage.trim()).not.toBe('');
    }
  });

  it('renders the documented fixture preview without executing side effects', () => {
    const catalog = buildWorkflowTemplateCatalog();

    expect(catalog).toHaveLength(WORKFLOW_TEMPLATES.length);
    for (const template of catalog) {
      expect(template.preview).toMatchObject({
        sideEffectsExecuted: false,
        fixtureValid: true,
        validationError: null,
      });
      expect(template.preview.renderedMessages).toEqual([
        template.testFixture.expectedMessage,
      ]);
    }
  });
});
