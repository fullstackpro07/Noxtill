ALTER TABLE `specialist_agent_ai_requests`
  ADD COLUMN `reserved_cost_usd` DECIMAL(14, 6) NOT NULL DEFAULT 0;
