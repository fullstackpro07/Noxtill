import { ActivityEventType, WorkflowTriggerKey } from '@prisma/client';
import { mapActivityEventToTriggerKey } from './workflow-trigger-map.util';

describe('mapActivityEventToTriggerKey', () => {
  it('maps payments but does not treat a credit write-off as a received payment', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.payment,
        'Credit payment from Jamie — 25',
      ),
    ).toBe(WorkflowTriggerKey.payment_received);
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.payment,
        'Wrote off 25 for Jamie: approved adjustment',
      ),
    ).toBeNull();
  });

  it('maps complaint and actual inventory changes to their workflow triggers', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.complaint,
        'New 2★ private feedback',
      ),
    ).toBe(WorkflowTriggerKey.complaint_received);
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.stock,
        'Purchase: +3 Blue T-Shirt',
      ),
    ).toBe(WorkflowTriggerKey.stock_changed);
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.stock,
        'Purchase order sent to Acme',
      ),
    ).toBeNull();
  });

  it('maps a recorded commerce validation to its workflow trigger', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_validation,
        'Product validation approve test: Travel mug',
      ),
    ).toBe(WorkflowTriggerKey.commerce_validation);
  });

  it('maps a commerce listing draft event to its workflow trigger', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_listing_draft,
        'Listing draft generated for Product on shopify',
      ),
    ).toBe(WorkflowTriggerKey.commerce_listing_draft);
  });

  it('maps SEO issue events to the owner-notification workflow trigger', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.seo_issue_detected,
        'SEO audit found 2 high-priority issues.',
      ),
    ).toBe(WorkflowTriggerKey.seo_issue_detected);
  });

  it('maps RFQ creation and award events to their dedicated workflow triggers', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_rfq_created,
        'RFQ created for supplier sourcing',
      ),
    ).toBe(WorkflowTriggerKey.commerce_rfq_created);
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_rfq_response_received,
        'Supplier quote recorded for RFQ',
      ),
    ).toBe(WorkflowTriggerKey.commerce_rfq_response_received);
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_rfq_awarded,
        'Supplier quote awarded; a draft Purchase Order was created for review',
      ),
    ).toBe(WorkflowTriggerKey.commerce_rfq_awarded);
  });

  it('maps supplier claim creation and full recovery to dedicated triggers', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_supplier_claim_created,
        'Supplier claim created',
      ),
    ).toBe(WorkflowTriggerKey.commerce_supplier_claim_created);
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.commerce_supplier_claim_settled,
        'Supplier claim fully recovered',
      ),
    ).toBe(WorkflowTriggerKey.commerce_supplier_claim_settled);
  });

  it.each<[string, WorkflowTriggerKey]>([
    [
      'New delivery for order #10 — auto-assigned',
      WorkflowTriggerKey.delivery_created,
    ],
    [
      'New online delivery order #10 — waiting for a rider',
      WorkflowTriggerKey.delivery_created,
    ],
    ['Rider assigned to order #10', WorkflowTriggerKey.delivery_assigned],
    ['Order #10 picked up', WorkflowTriggerKey.delivery_picked_up],
    ['Order #10 on the way', WorkflowTriggerKey.delivery_en_route],
    [
      'Order #10 delivered — proof captured',
      WorkflowTriggerKey.delivery_delivered,
    ],
    [
      'Order #10 failed — customer unavailable',
      WorkflowTriggerKey.delivery_failed,
    ],
    [
      'Order #10 retry booked (failed before: unavailable)',
      WorkflowTriggerKey.delivery_retried,
    ],
  ])('maps delivery event %s', (description, triggerKey) => {
    expect(
      mapActivityEventToTriggerKey(ActivityEventType.delivery, description),
    ).toBe(triggerKey);
  });

  it('does not create a trigger for unrelated delivery updates', () => {
    expect(
      mapActivityEventToTriggerKey(
        ActivityEventType.delivery,
        'Order #10 updated',
      ),
    ).toBeNull();
  });
});
