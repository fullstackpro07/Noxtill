-- Widened at the module21 -> main merge to the full union so this is safe to run after main's
-- Finance/Payments/Assets/Field Service/Contracts migrations (MySQL rejects narrowing an ENUM in use).
ALTER TABLE `action_item_states`
MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce', 'procurement_request', 'finance_approval', 'payment_approval', 'payment_dispute_due', 'payment_failed', 'asset_pm_overdue', 'asset_down_critical', 'asset_wo_approval', 'field_approval', 'field_sla_breach', 'field_unassigned_urgent', 'contract_approval', 'contract_expiring', 'contract_obligation_overdue', 'contract_signature_issue') NOT NULL;
