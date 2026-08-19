import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Idempotent baseline help content (BE-073) so the RAG pipeline has real passages to retrieve from. */
const ARTICLES: { slug: string; title: string; body: string; url: string }[] = [
  {
    slug: 'bookings-availability',
    title: 'How booking availability is calculated',
    body:
      'Available appointment slots are computed from your configured working hours combined with your ' +
      'existing appointments — a slot only appears if it falls inside your working hours AND does not ' +
      'overlap an appointment already on the books for that staff member (or, if no staff was picked, ' +
      'any appointment for that service). You can set different hours per day of the week from Settings > ' +
      'Working Hours. Double-bookings are prevented automatically even if two customers try to book the ' +
      'same slot at the exact same moment.',
    url: '/help/bookings-availability',
  },
  {
    slug: 'credit-ledger-basics',
    title: 'How the credit ledger works',
    body:
      'The Credit screen shows every customer who currently owes your business money (a running balance ' +
      'above zero), computed from every credit sale and payment recorded against them. Recording a payment ' +
      'immediately reduces their balance. You can send a payment reminder to one customer or to every ' +
      'debtor at once — reminders never go to a customer who has opted out of messages. A khata-style ' +
      'statement PDF, listing every dated entry and the running balance, can be shared with the customer ' +
      'at any time.',
    url: '/help/credit-ledger-basics',
  },
  {
    slug: 'review-requests-and-ratings',
    title: 'How review requests and public ratings work',
    body:
      'Two hours after a sale or a completed appointment, the customer automatically receives a review ' +
      'request link. If they rate you 4 or 5 stars, they are sent straight to your public Google review ' +
      'page — this is what protects your public rating. A 1-3 star rating is captured privately instead ' +
      'and never becomes a public review; you get an immediate alert so you can resolve the issue directly ' +
      'with the customer. Unanswered requests get a reminder at day 3 and day 7, and never more than that.',
    url: '/help/review-requests-and-ratings',
  },
  {
    slug: 'campaign-quota',
    title: 'How campaign sending and message quota work',
    body:
      'When you send a marketing campaign to a customer segment, the system checks your remaining monthly ' +
      'message quota against the number of reachable (non-opted-out) customers in that segment BEFORE ' +
      'sending anything. If quota is insufficient, the campaign is blocked entirely and nothing is sent — ' +
      'you will never end up with a campaign that stops partway through because it ran out of quota. Your ' +
      'plan determines your monthly quota; upgrading your plan raises it immediately.',
    url: '/help/campaign-quota',
  },
  {
    slug: 'plans-and-billing',
    title: 'How plans, trials, and billing work',
    body:
      'Every new business gets a 14-day free trial with no card required. During the trial you have full ' +
      "access at the Basic plan's limits. If the trial ends without upgrading, the account automatically " +
      "drops to Basic-level limits, which in practice means messaging stops once you hit that plan's " +
      'quota. You can upgrade to Starter, Pro, or Premium at any time from Settings > Billing & Plan, which ' +
      'starts a secure checkout; your plan and quota update automatically as soon as checkout completes.',
    url: '/help/plans-and-billing',
  },
  {
    slug: 'staff-commissions',
    title: 'How staff commissions are calculated',
    body:
      'Each staff or manager account can have a commission rule: either a percentage of the sales they ' +
      'personally rang up, or a fixed amount per completed appointment of a given service. The Commissions ' +
      "report for any month totals up each staff member's sales and computes what they are owed based on " +
      'their own rule — a percentage-rule staff member and a per-service-rule staff member can be compared ' +
      'side by side in the same report.',
    url: '/help/staff-commissions',
  },
];

@Injectable()
export class HelpArticlesSeedService implements OnModuleInit {
  private readonly logger = new Logger(HelpArticlesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run in background — do NOT await here. Awaiting DB queries in onModuleInit
    // blocks NestJS bootstrap and prevents app.listen() from being called within
    // Hostinger's 3-second startup window.
    void this.seed();
  }

  private async seed() {
    try {
      for (const article of ARTICLES) {
        await this.prisma.helpArticle.upsert({
          where: { slug: article.slug },
          create: article,
          update: {
            title: article.title,
            body: article.body,
            url: article.url,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to seed help articles: ${(error as Error).message}`,
      );
    }
  }
}
