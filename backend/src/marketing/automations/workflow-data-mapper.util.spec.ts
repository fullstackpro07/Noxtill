import {
  mergeWorkflowMappedData,
  previewWorkflowDataMapping,
  validateWorkflowDataMappings,
} from './workflow-data-mapper.util';

describe('previewWorkflowDataMapping', () => {
  it('maps nested object and array paths into a nested target', () => {
    const preview = previewWorkflowDataMapping(
      { order: { items: [{ sku: 'A-1', price: '12.50' }] } },
      [
        {
          sourcePath: 'order.items.0.sku',
          targetPath: 'line.sku',
          transform: 'uppercase',
        },
        {
          sourcePath: 'order.items.0.price',
          targetPath: 'line.price',
          transform: 'number',
        },
      ],
    );

    expect(preview).toMatchObject({
      valid: true,
      mappedFields: 2,
      mappedData: { line: { sku: 'A-1', price: 12.5 } },
      errors: [],
      warnings: [],
    });
  });

  it('reports missing required values and warns while omitting optional values', () => {
    const preview = previewWorkflowDataMapping({ customer: {} }, [
      { sourcePath: 'customer.email', targetPath: 'email' },
      { sourcePath: 'customer.phone', targetPath: 'phone', required: false },
    ]);

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual([
      expect.objectContaining({
        code: 'missing_required_source',
        path: 'email',
      }),
    ]);
    expect(preview.warnings).toEqual([
      expect.objectContaining({
        code: 'optional_source_missing',
        path: 'phone',
      }),
    ]);
    expect(preview.mappedData).toEqual({});
  });

  it('uses a configured fallback and records that it was used', () => {
    const preview = previewWorkflowDataMapping({}, [
      {
        sourcePath: 'customer.name',
        targetPath: 'customerName',
        fallback: 'Guest',
      },
    ]);

    expect(preview.valid).toBe(true);
    expect(preview.mappedData).toEqual({ customerName: 'Guest' });
    expect(preview.warnings[0]).toMatchObject({ code: 'fallback_used' });
  });

  it.each([
    { value: 'twelve', transform: 'number' as const },
    { value: 'yes', transform: 'boolean' as const },
    { value: 'not-a-date', transform: 'iso_date' as const },
  ])('rejects invalid $transform conversion input', ({ value, transform }) => {
    const preview = previewWorkflowDataMapping({ value }, [
      { sourcePath: 'value', targetPath: 'result', transform },
    ]);

    expect(preview.valid).toBe(false);
    expect(preview.errors[0]).toMatchObject({ code: 'transform_failed' });
    expect(preview.mappedData).toEqual({});
  });

  it('rejects prototype-related source and target paths without mutating prototypes', () => {
    const preview = previewWorkflowDataMapping(
      JSON.parse('{"safe":"value","__proto__":{"polluted":true}}') as Record<
        string,
        unknown
      >,
      [
        { sourcePath: '__proto__.polluted', targetPath: 'leak' },
        { sourcePath: 'safe', targetPath: 'constructor.polluted' },
      ],
    );

    expect(preview.valid).toBe(false);
    expect(preview.errors).toHaveLength(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects duplicate and overlapping target paths', () => {
    const preview = previewWorkflowDataMapping({ value: 'x' }, [
      { sourcePath: 'value', targetPath: 'customer' },
      { sourcePath: 'value', targetPath: 'customer.name' },
    ]);

    expect(preview.valid).toBe(false);
    expect(preview.errors[0]).toMatchObject({ code: 'duplicate_target' });
  });

  it('rejects source data that is too large, too deep, or not JSON serializable', () => {
    const tooLarge = previewWorkflowDataMapping(
      { value: 'x'.repeat(65_537) },
      [],
    );
    const nested: Record<string, unknown> = {};
    let cursor = nested;
    for (let index = 0; index < 22; index += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    const tooDeep = previewWorkflowDataMapping(nested, []);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const notJson = previewWorkflowDataMapping(circular, []);

    expect(tooLarge.errors[0]?.code).toBe('source_invalid');
    expect(tooDeep.errors[0]?.code).toBe('source_invalid');
    expect(notJson.errors[0]?.code).toBe('source_invalid');
  });

  it('enforces the mapping count limit', () => {
    const mappings = Array.from({ length: 101 }, (_, index) => ({
      sourcePath: 'value',
      targetPath: `field${index}`,
    }));

    const preview = previewWorkflowDataMapping({ value: 'x' }, mappings);

    expect(preview.errors[0]?.code).toBe('too_many_mappings');
    expect(preview.mappedFields).toBe(0);
  });

  it('validates persisted mapping configurations and rejects unsafe or overlapping paths', () => {
    expect(
      validateWorkflowDataMappings([
        {
          sourcePath: 'order.total',
          targetPath: 'orderTotal',
          transform: 'number',
        },
      ]),
    ).toBeNull();
    expect(
      validateWorkflowDataMappings([
        { sourcePath: 'order.total', targetPath: '__proto__.polluted' },
      ]),
    ).toMatch(/invalid target path/);
    expect(
      validateWorkflowDataMappings([
        { sourcePath: 'order', targetPath: 'order' },
        { sourcePath: 'order.total', targetPath: 'order.total' },
      ]),
    ).toMatch(/duplicates or overlaps/);
  });

  it('merges nested workflow outputs and enforces the combined size limit', () => {
    expect(
      mergeWorkflowMappedData(
        { customer: { firstName: 'Mia' } },
        { customer: { email: 'mia@example.test' } },
      ),
    ).toEqual({
      customer: { firstName: 'Mia', email: 'mia@example.test' },
    });
    expect(
      mergeWorkflowMappedData({}, { value: 'x'.repeat(65_537) }),
    ).toBeNull();
  });
});
