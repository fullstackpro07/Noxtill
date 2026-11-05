import {
  COMMERCE_AGENT_TOOLS,
  commerceAgentToolInputSchema,
} from './commerce-agent-tools.service';

describe('Commerce specialist read-tool contracts', () => {
  const exposedTools = COMMERCE_AGENT_TOOLS.filter(
    (tool) => tool.exposedToReadOnlyAssistant,
  );

  it('registers only executable read-only tools with unique provider names', () => {
    expect(exposedTools.length).toBeGreaterThan(0);
    expect(new Set(exposedTools.map((tool) => tool.key)).size).toBe(
      exposedTools.length,
    );
    for (const tool of exposedTools) {
      expect(tool.riskClass).toBe('READ_ONLY');
      expect(tool.executable).toBe(true);
      expect(commerceAgentToolInputSchema(tool)).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }
  });

  it('derives required, optional and no-input provider schemas from the catalog', () => {
    expect(
      commerceAgentToolInputSchema(
        COMMERCE_AGENT_TOOLS.find((tool) => tool.key === 'get_order')!,
      ),
    ).toEqual({
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
      additionalProperties: false,
    });

    expect(
      commerceAgentToolInputSchema(
        COMMERCE_AGENT_TOOLS.find(
          (tool) => tool.key === 'calculate_fulfillment_route',
        )!,
      ),
    ).toEqual({
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        destinationCountry: { type: 'string' },
      },
      required: ['orderId'],
      additionalProperties: false,
    });

    expect(
      commerceAgentToolInputSchema(
        COMMERCE_AGENT_TOOLS.find((tool) => tool.key === 'get_inventory')!,
      ),
    ).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });
});
