-- BE-M9: attribute a marketing send back to the campaign that queued it, for funnel reporting (BE-061).
ALTER TABLE "messages" ADD COLUMN "campaign_id" TEXT;

ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
