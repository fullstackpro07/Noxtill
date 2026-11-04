CREATE TABLE `specialist_agent_actions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `run_id` VARCHAR(191) NOT NULL,
  `recommendation_id` VARCHAR(191) NOT NULL,
  `agent_key` VARCHAR(64) NOT NULL,
  `module_id` VARCHAR(16) NOT NULL,
  `branch_business_id` VARCHAR(191) NULL,
  `action_type` VARCHAR(64) NOT NULL,
  `canonical_resource_type` VARCHAR(40) NOT NULL,
  `canonical_resource_id` VARCHAR(191) NOT NULL,
  `expected_version` INTEGER NULL,
  `expected_postcondition` JSON NOT NULL,
  `proposed_payload` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `reason` TEXT NOT NULL,
  `evidence_refs` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `assumptions` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `confidence_value` DOUBLE NULL,
  `risk_tier` VARCHAR(16) NOT NULL,
  `risk_description` TEXT NULL,
  `expected_benefit` JSON NULL,
  `expected_downside` JSON NULL,
  `policy_result` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `permission_result` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `required_approval` BOOLEAN NOT NULL DEFAULT true,
  `required_approver_role` VARCHAR(40) NULL,
  `approval_reason` TEXT NULL,
  `rejection_reason` TEXT NULL,
  `idempotency_key_hash` CHAR(64) NOT NULL,
  `correlation_id` VARCHAR(191) NOT NULL,
  `execution_attempt_count` INTEGER NOT NULL DEFAULT 0,
  `canonical_operation_id` VARCHAR(191) NULL,
  `state` VARCHAR(32) NOT NULL,
  `actual_result` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `verification_result` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `rollback_instruction` TEXT NULL,
  `error_code` VARCHAR(64) NULL,
  `error_message` TEXT NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `approved_by_user_id` VARCHAR(191) NULL,
  `executed_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `approved_at` DATETIME(3) NULL,
  `executed_at` DATETIME(3) NULL,
  `verified_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  UNIQUE INDEX `specialist_agent_actions_business_idempotency_uq` (`business_id`, `idempotency_key_hash`),
  INDEX `specialist_agent_actions_business_state_created_idx` (`business_id`, `state`, `created_at`),
  INDEX `specialist_agent_actions_business_agent_created_idx` (`business_id`, `agent_key`, `created_at`),
  INDEX `specialist_agent_actions_resource_idx` (`business_id`, `canonical_resource_type`, `canonical_resource_id`),
  INDEX `specialist_agent_actions_run_created_idx` (`run_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_actions_business_fk`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_actions_run_fk`
    FOREIGN KEY (`run_id`) REFERENCES `specialist_agent_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_actions_recommendation_fk`
    FOREIGN KEY (`recommendation_id`) REFERENCES `specialist_agent_recommendations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `specialist_agent_action_events` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `action_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `from_state` VARCHAR(32) NULL,
  `to_state` VARCHAR(32) NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `metadata` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `specialist_agent_action_events_business_action_created_idx` (`business_id`, `action_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_action_events_business_fk`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_action_events_action_fk`
    FOREIGN KEY (`action_id`) REFERENCES `specialist_agent_actions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `specialist_agent_actions` (
  `id`, `business_id`, `run_id`, `recommendation_id`, `agent_key`, `module_id`,
  `branch_business_id`, `action_type`, `canonical_resource_type`, `canonical_resource_id`,
  `expected_version`, `expected_postcondition`, `proposed_payload`, `reason`, `evidence_refs`,
  `assumptions`, `confidence_value`, `risk_tier`, `risk_description`, `policy_result`,
  `permission_result`, `required_approval`, `idempotency_key_hash`, `correlation_id`,
  `canonical_operation_id`, `state`, `actual_result`, `verification_result`,
  `created_by_user_id`, `approved_by_user_id`, `created_at`, `updated_at`, `approved_at`,
  `verified_at`, `closed_at`
)
SELECT
  UUID(), request.`business_id`, recommendation.`run_id`, recommendation.`id`,
  recommendation.`agent_key`, run.`module_id`, request.`branch_business_id`,
  'inventory_reorder_request', 'ProcurementRequest', request.`id`, request.`version`,
  JSON_OBJECT('requestId', request.`id`, 'targetStatus', 'converted',
              'createdResourceType', 'PurchaseOrder', 'linkedFromRequestId', request.`id`),
  JSON_OBJECT(
    'requestId', request.`id`, 'currency', request.`currency`,
    'supplierId', request.`supplier_id`, 'status', request.`status`,
    'items', COALESCE((
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'productId', item.`product_id`, 'lineType', item.`line_type`,
        'quantity', item.`quantity`, 'estimatedUnitCost', item.`estimated_unit_cost`
      )) FROM `procurement_request_items` item WHERE item.`request_id` = request.`id`
    ), JSON_ARRAY())
  ),
  request.`reason`,
  COALESCE((
    SELECT JSON_ARRAYAGG(evidence.`id`)
    FROM `specialist_agent_evidence` evidence
    WHERE evidence.`recommendation_id` = recommendation.`id`
  ), JSON_ARRAY()),
  recommendation.`assumptions`, recommendation.`confidence_value`, recommendation.`risk_tier`,
  NULL,
  JSON_OBJECT('approvalRequired', true, 'approvalSource', 'canonical_procurement'),
  JSON_OBJECT('authorization', 'canonical_procurement_service'), true,
  SHA2(CONCAT(request.`business_id`, ':inventory_intelligence:inventory_reorder_request:', recommendation.`id`), 256),
  recommendation.`run_id`, request.`converted_purchase_order_id`,
  CASE
    WHEN request.`status` = 'draft' THEN 'proposed'
    WHEN request.`status` = 'submitted' THEN 'approval_required'
    WHEN request.`status` IN ('approved', 'sourcing') THEN 'approved'
    WHEN request.`status` = 'rejected' THEN 'rejected'
    WHEN request.`status` = 'cancelled' THEN 'cancelled'
    WHEN request.`status` = 'converted' AND purchase_order.`id` IS NOT NULL THEN 'verified'
    ELSE 'needs_review'
  END,
  JSON_OBJECT('procurementRequestId', request.`id`, 'purchaseOrderId', request.`converted_purchase_order_id`),
  CASE
    WHEN request.`status` = 'converted' AND purchase_order.`id` IS NOT NULL
      THEN JSON_OBJECT('verified', true, 'source', 'canonical_purchase_order_link',
                       'purchaseOrderId', purchase_order.`id`)
    ELSE JSON_OBJECT()
  END,
  request.`requester_user_id`, request.`reviewed_by_user_id`, request.`created_at`, request.`updated_at`,
  request.`reviewed_at`,
  CASE WHEN request.`status` = 'converted' AND purchase_order.`id` IS NOT NULL THEN request.`updated_at` ELSE NULL END,
  CASE WHEN request.`status` IN ('rejected', 'cancelled', 'converted') THEN request.`updated_at` ELSE NULL END
FROM `procurement_requests` request
JOIN `specialist_agent_recommendations` recommendation
  ON recommendation.`id` = request.`source_agent_recommendation_id`
JOIN `specialist_agent_runs` run ON run.`id` = recommendation.`run_id`
LEFT JOIN `purchase_orders` purchase_order
  ON purchase_order.`id` = request.`converted_purchase_order_id`
WHERE request.`source_agent_recommendation_id` IS NOT NULL
  AND recommendation.`agent_key` = 'inventory_intelligence';

INSERT INTO `specialist_agent_action_events` (
  `id`, `business_id`, `action_id`, `event_type`, `from_state`, `to_state`,
  `actor_user_id`, `reason`, `metadata`, `created_at`
)
SELECT UUID(), action.`business_id`, action.`id`, 'historical_backfill', NULL, action.`state`,
  action.`created_by_user_id`, 'Action lifecycle initialized from the linked canonical Procurement request.',
  JSON_OBJECT('canonicalResourceType', action.`canonical_resource_type`,
              'canonicalResourceId', action.`canonical_resource_id`),
  action.`created_at`
FROM `specialist_agent_actions` action
WHERE action.`action_type` = 'inventory_reorder_request';
