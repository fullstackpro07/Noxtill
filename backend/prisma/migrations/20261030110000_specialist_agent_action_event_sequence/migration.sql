ALTER TABLE `specialist_agent_action_events`
  ADD COLUMN `sequence` INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX `specialist_agent_action_events_action_sequence_uq`
  ON `specialist_agent_action_events` (`action_id`, `sequence`);
