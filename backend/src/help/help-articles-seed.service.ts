import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Idempotent baseline help content (BE-073) so the RAG pipeline has real passages to retrieve from.
 * `steps` breaks each article's own `body` into a scannable, numbered list for the Help Assistant
 * drawer — every step restates something the body already says, never a new claim. */
const ARTICLES: { slug: string; title: string; body: string; url: string; steps: string[] }[] = [
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
    steps: [
      'A slot is only offered if it falls inside your configured working hours',
      'It must also not overlap an appointment already on the books for that staff member',
      'If no staff was picked, it must not overlap any appointment for that service',
      'Set different working hours per day of the week from Settings > Working Hours',
      'Two customers booking the same slot at the same moment are still prevented from double-booking',
    ],
  },
  {
    slug: 'credit-ledger-basics',
    title: 'How the credit ledger works',
    body:
      'The Credit screen shows every customer who currently owes your business money (an outstanding ' +
      'balance above zero), computed from every credit sale and payment recorded against them. Recording a ' +
      'payment immediately reduces their balance. You can send a payment reminder to one customer or to ' +
      'every debtor at once — reminders never go to a customer who has opted out of messages. A Record ' +
      'Book-style statement PDF, listing every dated entry and the balance after each one, can be shared ' +
      'with the customer at any time.',
    url: '/help/credit-ledger-basics',
    steps: [
      "Every credit sale and payment recorded against a customer updates their running balance",
      'Recording a payment immediately reduces that balance',
      'Send a reminder to one customer, or to every debtor at once, from the Credit screen',
      'A customer who has opted out of messages never receives a reminder',
      'Share a Record Book-style statement PDF — every dated entry and the running balance — at any time',
    ],
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
    steps: [
      'A review request link is sent automatically 2 hours after a sale or completed appointment',
      'A 4 or 5 star rating is sent straight to your public Google review page',
      'A 1-3 star rating is captured privately and never becomes a public review',
      'A private low rating triggers an immediate alert so you can resolve it directly with the customer',
      'An unanswered request gets one reminder at day 3 and another at day 7 — never more',
    ],
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
    steps: [
      'Before sending, the system checks your remaining monthly message quota',
      'It compares that quota against the number of reachable, non-opted-out customers in the segment',
      'If quota is insufficient, the whole campaign is blocked and nothing is sent',
      'A campaign never stops partway through from running out of quota mid-send',
      'Upgrading your plan raises your monthly quota immediately',
    ],
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
    steps: [
      'Every new business gets a 14-day free trial with no card required',
      "During the trial you have full access at the Basic plan's limits",
      'If the trial ends without upgrading, the account drops to Basic-level limits automatically',
      'Upgrade to Starter, Pro, or Premium at any time from Settings > Billing & Plan',
      'Your plan and quota update automatically as soon as checkout completes',
    ],
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
    steps: [
      'Each staff or manager account can have a commission rule assigned',
      'A rule is either a percentage of sales they personally rang up, or a fixed amount per completed appointment',
      "The Commissions report for a month totals each staff member's sales",
      'It computes what they are owed based on their own assigned rule',
      'A percentage-rule and a per-service-rule staff member can be compared side by side in the same report',
    ],
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
            steps: article.steps,
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
