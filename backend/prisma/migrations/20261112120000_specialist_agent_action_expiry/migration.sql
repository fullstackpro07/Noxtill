ALTER TABLE `specialist_agent_actions`
  ADD COLUMN `approval_expires_at` DATETIME(3) NULL;

UPDATE `specialist_agent_actions`
SET `approval_expires_at` = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY)
WHERE `state` = 'approval_required';

CREATE INDEX `specialist_agent_actions_state_expiry_idx`
  ON `specialist_agent_actions` (`state`, `approval_expires_at`);
