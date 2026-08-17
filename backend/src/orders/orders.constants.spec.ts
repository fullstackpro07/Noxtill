import { ORDER_STATUS_TRANSITIONS } from './orders.constants';
import { OrderStatus } from '@prisma/client';

describe('ORDER_STATUS_TRANSITIONS (BE-026 flow guard)', () => {
  it('allows the standard forward flow', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.pending]).toContain(
      OrderStatus.confirmed,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.confirmed]).toContain(
      OrderStatus.in_progress,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.in_progress]).toContain(
      OrderStatus.completed,
    );
  });

  it('allows cancellation from any non-terminal state', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.pending]).toContain(
      OrderStatus.cancelled,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.confirmed]).toContain(
      OrderStatus.cancelled,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.in_progress]).toContain(
      OrderStatus.cancelled,
    );
  });

  it('has no transitions out of terminal states', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.completed]).toHaveLength(0);
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.cancelled]).toHaveLength(0);
  });

  it('disallows skipping a step (pending straight to completed)', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.pending]).not.toContain(
      OrderStatus.completed,
    );
  });
});
