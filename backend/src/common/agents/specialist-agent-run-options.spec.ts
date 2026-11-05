import { createSpecialistAgentTriggerRef } from './specialist-agent-run-options';

describe('createSpecialistAgentTriggerRef', () => {
  it('normalizes source timestamps and supplies the versioned trace fields', () => {
    const occurredAt = new Date('2026-10-25T10:30:00.000Z');

    expect(
      createSpecialistAgentTriggerRef({
        eventId: 'delivery-failed:delivery-1:2026-10-25T10:30:00.000Z',
        sourceModule: 'delivery',
        entityType: 'Delivery',
        entityId: 'delivery-1',
        occurredAt,
        entityVersion: occurredAt.toISOString(),
      }),
    ).toEqual({
      eventId: 'delivery-failed:delivery-1:2026-10-25T10:30:00.000Z',
      sourceModule: 'delivery',
      entityType: 'Delivery',
      entityId: 'delivery-1',
      occurredAt: '2026-10-25T10:30:00.000Z',
      entityVersion: '2026-10-25T10:30:00.000Z',
      schemaVersion: 1,
      correlationId: 'delivery-failed:delivery-1:2026-10-25T10:30:00.000Z',
    });
  });

  it('keeps an explicit correlation ID and represents unversioned sources honestly', () => {
    expect(
      createSpecialistAgentTriggerRef({
        eventId: 'event-1',
        sourceModule: 'customers',
        entityType: 'ActivityEvent',
        entityId: 'activity-1',
        occurredAt: '2026-10-25T10:30:00Z',
        entityVersion: null,
        correlationId: 'trace-123',
      }),
    ).toMatchObject({
      entityVersion: null,
      schemaVersion: 1,
      correlationId: 'trace-123',
    });
  });

  it('rejects invalid source timestamps and incomplete event identity', () => {
    expect(() =>
      createSpecialistAgentTriggerRef({
        eventId: 'event-1',
        sourceModule: 'inventory',
        entityType: 'StockCount',
        entityId: 'count-1',
        occurredAt: 'not-a-date',
      }),
    ).toThrow('Invalid specialist-agent source event reference');

    expect(() =>
      createSpecialistAgentTriggerRef({
        eventId: ' ',
        sourceModule: 'inventory',
        entityType: 'StockCount',
        entityId: 'count-1',
        occurredAt: new Date(),
      }),
    ).toThrow('Invalid specialist-agent source event reference');
  });
});
