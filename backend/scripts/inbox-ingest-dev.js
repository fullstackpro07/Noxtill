/* eslint-disable */
// Dev-only: feeds one inbound message through InboxAutomationService.ingest() — the same call the
// WhatsApp/SMS webhook processor makes — for local testing without provider webhook secrets.
// Real Prisma, real AI client, real notifications; only outbound sending is not wired here.
// Usage: node scripts/inbox-ingest-dev.js <businessId> <channel> <handle> "<name>" "<text>"
require('dotenv').config();
const { ConfigService } = require('@nestjs/config');
const d = (p) => require(`../dist/${p}`);

async function main() {
  const [businessId, channel, handle, name, text] = process.argv.slice(2);
  if (!businessId || !channel || !handle || !text) {
    console.error('usage: node scripts/inbox-ingest-dev.js <businessId> <channel> <handle> <name> <text>');
    process.exit(1);
  }
  const store = {};
  const cls = { get: (k) => store[k], set: (k, v) => (store[k] = v) };
  const prisma = new (d('prisma/prisma.service').PrismaService)();
  await prisma.$connect();
  const tenant = new (d('common/tenancy/tenant-prisma.service').TenantPrismaService)(prisma, cls);
  const config = new ConfigService(process.env);
  const settings = new (d('unified-inbox/inbox-settings.service').InboxSettingsService)(prisma);
  const notifications = new (d('notifications/notifications.service').NotificationsService)(tenant);
  const core = new (d('unified-inbox/inbox-core.service').InboxCoreService)(prisma, notifications, settings);
  const facts = new (d('unified-inbox/inbox-facts.service').InboxFactsService)(prisma, new (d('common/localization/locale.service').LocaleService)());
  const notWired = { send: async () => { throw new Error('Outbound sending is not wired in the dev ingest script'); } };
  const window = new (d('whatsapp/whatsapp-window.service').WhatsappWindowService)(tenant);
  const sender = new (d('unified-inbox/inbox-send.service').InboxSendService)(prisma, notWired, { reply: notWired.send }, window, core);
  const aiInfra = new (d('ai/ai-infra.service').AiInfraService)(prisma, new (d('ai/claude.client').ClaudeClient)(config), config);
  const ai = new (d('unified-inbox/inbox-ai.service').InboxAiService)(prisma, aiInfra, facts, settings, core, sender);
  const inbox = new (d('unified-inbox/inbox-automation.service').InboxAutomationService)(prisma, core, settings, sender, ai);
  cls.set('businessId', businessId);
  const conv = await inbox.ingest({ businessId, channel, contactHandle: handle, contactName: name || undefined, text, externalKey: `${channel}:dev-${Date.now()}` });
  console.log(JSON.stringify({ id: conv && conv.id, customerId: conv && conv.customerId, tags: conv && conv.tags }));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
