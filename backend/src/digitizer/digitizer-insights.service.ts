import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { DigitizerViewService } from './digitizer-view.service';
import { AssessedBatch } from './digitizer-assessment.service';
import { isOpenStatus, needsHuman } from './digitizer-summary';
import { formatAmount, parseAmount, parseIsoDate } from './digitizer-rules';
import {
  DIGITIZER_ERROR_CODES,
  DIGITIZER_MODEL,
  OUTLIER_AMOUNT_MULTIPLE,
  OUTLIER_MIN_SAMPLES,
  STOCK_JUMP_MULTIPLE,
} from './digitizer.constants';
import {
  AssistantAnomaly,
  AssistantAnswer,
  AssistantFinding,
  AssistantOverview,
  DocumentSummary,
} from './digitizer.api-types';

type Loaded = {
  assessed: AssessedBatch[];
  summaries: DocumentSummary[];
  currency: string;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function shortDate(iso: string | null): string {
  if (!iso) return 'an unknown date';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/**
 * Everything the AI Assistant screen shows is worked out from the documents themselves — invoice
 * numbers, line items, amounts, dates, stock levels — and is labelled observed (read directly) or
 * inferred (concluded from a few fields). The language model is only used to answer a free-form
 * question, and only ever sees a compact summary of the same data.
 */
@Injectable()
export class DigitizerInsightsService {
  private readonly logger = new Logger(DigitizerInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly view: DigitizerViewService,
    private readonly aiInfra: AiInfraService,
  ) {}

  // ───────────────────────────── overview ─────────────────────────────

  async overview(businessId: string): Promise<AssistantOverview> {
    const data = await this.load(businessId);
    const findings = this.findings(data);
    const anomalies = await this.anomalies(businessId, data);
    const open = data.assessed.filter((_, i) =>
      isOpenStatus(data.summaries[i].status),
    );

    const rowsNeed = open.reduce(
      (n, a) =>
        n +
        a.assessment.counts.needsReview +
        a.assessment.counts.blocked +
        a.assessment.counts.failed,
      0,
    );
    const docsNeed = data.summaries.filter((s) => needsHuman(s.status)).length;
    const dupRows = open.reduce(
      (n, a) => n + a.assessment.counts.duplicates,
      0,
    );
    const mismatch = open.find(
      (a) => a.assessment.reconciliation && !a.assessment.reconciliation.ok,
    );
    const peopleRows = open.reduce(
      (n, a) =>
        n +
        a.assessment.rows.filter((r) => r.destination === 'customer').length,
      0,
    );

    return {
      documents: data.summaries.length,
      prompts: [
        {
          key: 'review',
          label: 'Which rows need review?',
          hint: rowsNeed
            ? `${rowsNeed} across ${plural(docsNeed, 'document')}`
            : 'Nothing needs review',
        },
        {
          key: 'duplicates',
          label: 'Show records that already exist',
          hint: dupRows
            ? `${plural(dupRows, 'candidate')}`
            : 'No candidates found',
        },
        {
          key: 'total',
          label: "Why doesn't the total match?",
          hint: mismatch?.assessment.reconciliation
            ? `${formatAmount(Math.abs(mismatch.assessment.reconciliation.difference ?? 0), data.currency)} gap explained`
            : 'No document has a mismatch',
        },
        {
          key: 'extract',
          label: 'Just extract the names and phone numbers',
          hint: peopleRows
            ? `${plural(peopleRows, 'customer row')} · no records created`
            : 'No customer rows yet',
        },
        {
          key: 'summary',
          label: 'Summarize the latest document',
          hint: data.summaries[0] ? data.summaries[0].name : 'No documents yet',
        },
      ],
      findings,
      anomalies,
    };
  }

  // ───────────────────────────── cross-document findings ─────────────────────────────

  private findings({
    assessed,
    summaries,
    currency,
  }: Loaded): AssistantFinding[] {
    const out: AssistantFinding[] = [];
    const invoices = assessed
      .map((a, i) => ({ a, s: summaries[i] }))
      .filter(
        ({ a, s }) =>
          s.status !== 'failed' &&
          s.status !== 'queued' &&
          s.status !== 'processing' &&
          a.analysis.invoiceNumber,
      );

    // 1. Invoice number sequences with a gap — observed.
    const sequences = new Map<
      string,
      {
        supplier: string;
        prefix: string;
        width: number;
        nums: number[];
        ids: string[];
      }
    >();
    for (const { a, s } of invoices) {
      const m = /^(.*?)(\d+)\s*$/.exec(a.analysis.invoiceNumber ?? '');
      if (!m) continue;
      const supplier = (a.analysis.supplier ?? 'Unknown supplier').trim();
      const key = `${supplier.toLowerCase()}|${m[1]}`;
      const seq = sequences.get(key) ?? {
        supplier,
        prefix: m[1],
        width: m[2].length,
        nums: [],
        ids: [],
      };
      seq.nums.push(Number(m[2]));
      seq.ids.push(s.id);
      seq.width = Math.max(seq.width, m[2].length);
      sequences.set(key, seq);
    }
    for (const seq of sequences.values()) {
      const nums = [...new Set(seq.nums)].sort((x, y) => x - y);
      if (nums.length < 2 || nums[nums.length - 1] - nums[0] > 60) continue;
      const missing: number[] = [];
      for (let n = nums[0]; n <= nums[nums.length - 1]; n += 1)
        if (!nums.includes(n)) missing.push(n);
      if (!missing.length) continue;
      const pad = (n: number) =>
        `${seq.prefix}${String(n).padStart(seq.width, '0')}`;
      out.push({
        kind: 'observed',
        scope: `${plural(nums.length, 'invoice')} · ${seq.supplier}`,
        finding: `Invoice numbers skip ${missing.slice(0, 4).map(pad).join(' and ')}${missing.length > 4 ? ' and more' : ''}`,
        evidence: `The sequence runs ${nums.map(pad).join(', ')}. ${plural(missing.length, 'number is', 'numbers are')} missing from what you uploaded — they may exist on paper you have not scanned.`,
        documentIds: seq.ids,
      });
    }

    // 2. Unit price moving across invoices from one supplier — observed.
    const prices = new Map<
      string,
      {
        supplier: string;
        item: string;
        points: { price: number; at: string; id: string }[];
      }
    >();
    for (const { a, s } of invoices) {
      const supplier = (a.analysis.supplier ?? 'Unknown supplier').trim();
      for (const li of a.analysis.lineItems) {
        if (!li.description || li.unitPrice === null) continue;
        const key = `${supplier.toLowerCase()}|${li.description.trim().toLowerCase()}`;
        const entry = prices.get(key) ?? {
          supplier,
          item: li.description.trim(),
          points: [],
        };
        entry.points.push({
          price: li.unitPrice,
          at: a.analysis.documentDate ?? s.uploadedAt,
          id: s.id,
        });
        prices.set(key, entry);
      }
    }
    for (const p of prices.values()) {
      const pts = p.points.sort((x, y) => x.at.localeCompare(y.at));
      if (pts.length < 2 || new Set(pts.map((x) => x.price)).size < 2) continue;
      const first = pts[0].price;
      const last = pts[pts.length - 1].price;
      out.push({
        kind: 'observed',
        scope: `${plural(pts.length, 'invoice')} · ${p.supplier}`,
        finding: `Unit cost on ${p.item} ${last > first ? 'rose' : last < first ? 'fell' : 'changed'} across ${pts.length} invoices`,
        evidence: `${pts.map((x) => `${formatAmount(x.price, currency)} on ${shortDate(x.at)}`).join(', ')}.`,
        documentIds: [...new Set(pts.map((x) => x.id))],
      });
    }

    // 3. Two documents with the same supplier, date and total — inferred.
    const sameTotals = new Map<string, string[]>();
    for (const { a, s } of invoices) {
      const total = a.analysis.totals?.printedTotal;
      if (
        total === null ||
        total === undefined ||
        !a.analysis.documentDate ||
        !a.analysis.supplier
      )
        continue;
      const key = `${a.analysis.supplier.toLowerCase()}|${a.analysis.documentDate}|${total}`;
      sameTotals.set(key, [...(sameTotals.get(key) ?? []), s.id]);
    }
    for (const [key, ids] of sameTotals) {
      if (ids.length < 2) continue;
      const [supplier, date, total] = key.split('|');
      out.push({
        kind: 'inferred',
        scope: `${plural(ids.length, 'invoice')}`,
        finding: 'One invoice may be a duplicate of another',
        evidence: `${ids.length} documents share the same supplier (${supplier}), date (${date}) and total (${formatAmount(Number(total), currency)}). This is a guess based on those three fields, not a confirmed duplicate.`,
        documentIds: ids,
      });
    }

    // 4. Expense rows with no readable date — observed.
    const undated = assessed
      .map((a, i) => ({ a, s: summaries[i] }))
      .filter(({ s }) => isOpenStatus(s.status))
      .flatMap(({ a, s }) =>
        a.assessment.rows
          .filter(
            (r) =>
              r.destination === 'expense' &&
              r.state !== 'imported' &&
              r.fields.find((f) => f.field === 'incurredOn')?.blank !== false,
          )
          .map(() => s.id),
      );
    if (undated.length) {
      out.push({
        kind: 'observed',
        scope: plural(undated.length, 'receipt'),
        finding: `${undated.length === 1 ? 'A receipt has' : `${undated.length} receipts have`} no readable date`,
        evidence:
          'The date was left blank rather than inferred from the file’s upload time. Each needs a date typed in before it can import.',
        documentIds: [...new Set(undated)],
      });
    }
    return out;
  }

  // ───────────────────────────── anomalies ─────────────────────────────

  private async anomalies(
    businessId: string,
    { assessed, summaries, currency }: Loaded,
  ): Promise<AssistantAnomaly[]> {
    const out: AssistantAnomaly[] = [];
    const today = Date.now();

    // Typical spend: what the business has really recorded, plus what is sitting in scans.
    const recorded = await this.prisma.expense.findMany({
      where: { businessId },
      select: { amount: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const amounts = recorded.map((e) => Number(e.amount)).filter((n) => n > 0);

    // Stock levels for count sheets.
    const productNames = new Set<string>();
    for (const a of assessed)
      for (const r of a.assessment.rows)
        if (r.destination === 'inventory' && r.product)
          productNames.add(r.product.id);

    assessed.forEach((a, i) => {
      const s = summaries[i];
      if (!isOpenStatus(s.status)) return;
      const handwritten = a.analysis.handwriting === 'handwritten';

      // Amount far above what is usual.
      if (amounts.length >= OUTLIER_MIN_SAMPLES) {
        const typical = median(amounts);
        for (const r of a.assessment.rows) {
          if (r.destination !== 'expense' || r.state === 'imported') continue;
          const amt = parseAmount(
            r.fields.find((f) => f.field === 'amount')?.normalized,
          );
          if (
            amt !== null &&
            typical > 0 &&
            amt >= typical * OUTLIER_AMOUNT_MULTIPLE
          ) {
            out.push({
              title: 'Amount far above your usual',
              reason: `${formatAmount(amt, currency)} against a ${formatAmount(typical, currency)} median across your ${plural(amounts.length, 'recorded expense')}. Could be a genuine large purchase or a misread decimal.`,
              confidence: 'medium',
              basis: `${plural(amounts.length, 'expense')} compared`,
              documentId: s.id,
              documentName: s.name,
              blocksImport: false,
            });
          }
        }
      }

      // A stock count that jumps by a large multiple.
      for (const r of a.assessment.rows) {
        if (
          r.destination !== 'inventory' ||
          !r.product ||
          r.state === 'imported'
        )
          continue;
        const counted = parseAmount(
          r.fields.find((f) => f.field === 'countedQty')?.normalized,
        );
        if (
          counted !== null &&
          r.product.stockQty > 0 &&
          counted >= r.product.stockQty * STOCK_JUMP_MULTIPLE
        ) {
          out.push({
            title: `Stock quantity up ${Math.round(counted / r.product.stockQty)}×`,
            reason: `${r.product.name} goes from ${r.product.stockQty} to ${counted} on the count sheet. ${handwritten ? 'It is handwritten, so a digit may be misread — or it may be a real delivery.' : 'That may be a real delivery or a typo.'}`,
            confidence: 'medium',
            basis: 'Against current inventory',
            documentId: s.id,
            documentName: s.name,
            blocksImport: false,
          });
        }
      }

      // A ledger whose written balance is not what its entries produce.
      const rec = a.assessment.reconciliation;
      if (rec && !rec.ok && rec.kind === 'ledger') {
        out.push({
          title: 'Credit ledger does not reconcile',
          reason: rec.message,
          confidence: 'high',
          basis: `Reconciled across ${plural(a.analysis.ledger?.entries.length ?? 0, 'entry', 'entries')}`,
          documentId: s.id,
          documentName: s.name,
          blocksImport: true,
        });
      }

      // A date that has not happened yet.
      const docDate = parseIsoDate(a.analysis.documentDate);
      if (docDate && docDate.getTime() > today + 24 * 3600 * 1000) {
        out.push({
          title: 'Document dated in the future',
          reason: `It reads ${a.analysis.documentDate}, which has not happened yet. Likely a written or misread date.`,
          confidence: 'high',
          basis: "Against today's date",
          documentId: s.id,
          documentName: s.name,
          blocksImport: false,
        });
      }

      // A quantity that cannot be real.
      const negative = a.analysis.lineItems.find(
        (l) => l.quantity !== null && l.quantity < 0,
      );
      const negativeRow = a.assessment.rows.find((r) =>
        r.issues.some((x) => x.code === 'negative_quantity'),
      );
      if (negative || negativeRow) {
        out.push({
          title: 'Impossible quantity',
          reason: negative
            ? `A line reads ${negative.quantity} units${negative.description ? ` (${negative.description})` : ''}. Negative quantities are not valid on an invoice or count.`
            : 'A quantity is negative, which is not valid here.',
          confidence: 'high',
          basis: 'Business rule',
          documentId: s.id,
          documentName: s.name,
          blocksImport: true,
        });
      }
    });

    return out.sort(
      (x, y) =>
        Number(y.confidence === 'high') - Number(x.confidence === 'high'),
    );
  }

  // ───────────────────────────── answers ─────────────────────────────

  async ask(
    businessId: string,
    input: { key?: string; question?: string },
  ): Promise<AssistantAnswer> {
    const key = input.key ?? this.route(input.question ?? '');
    const data = await this.load(businessId);
    switch (key) {
      case 'review':
        return this.answerReview(data);
      case 'duplicates':
        return this.answerDuplicates(data);
      case 'total':
        return this.answerTotal(data);
      case 'extract':
        return this.answerExtract(data);
      case 'summary':
        return this.answerSummary(data);
      default:
        return this.answerFree(businessId, input.question ?? '', data);
    }
  }

  private route(q: string): string | undefined {
    const t = q.toLowerCase();
    if (
      /(which|what).*(rows?|records?).*(review|attention|need)|need(s)? review/.test(
        t,
      )
    )
      return 'review';
    if (/duplicate|already exist|existing (customer|record)/.test(t))
      return 'duplicates';
    if (
      /(total|balance).*(match|reconcile|wrong)|doesn.?t match|mismatch/.test(t)
    )
      return 'total';
    if (/extract.*(names?|phones?)|just extract/.test(t)) return 'extract';
    if (/summar|what('| i)s in (this|the)|what is in/.test(t)) return 'summary';
    return undefined;
  }

  private async load(businessId: string): Promise<Loaded> {
    const { assessed, summaries, rules } = await this.view.loadAll(businessId);
    return { assessed, summaries, currency: rules.currency };
  }

  private openDocs({ assessed, summaries }: Loaded) {
    return assessed
      .map((a, i) => ({ a, s: summaries[i] }))
      .filter(({ s }) => isOpenStatus(s.status));
  }

  private answerReview(data: Loaded): AssistantAnswer {
    const open = this.openDocs(data);
    const attention = open.filter(({ s }) => needsHuman(s.status));
    const rowsNeed = attention.reduce(
      (n, { a }) =>
        n +
        a.assessment.counts.needsReview +
        a.assessment.counts.blocked +
        a.assessment.counts.failed,
      0,
    );
    const clean = open.reduce((n, { a }) => n + a.assessment.counts.ready, 0);

    const tally = (code: string) =>
      open.reduce(
        (n, { a }) =>
          n +
          a.assessment.rows.filter(
            (r) =>
              r.state !== 'imported' &&
              r.issues.some(
                (i) =>
                  i.code === code ||
                  (code === 'invalid' && i.code.startsWith('invalid_')),
              ),
          ).length,
        0,
      );
    const lowRows = open.reduce(
      (n, { a }) =>
        n + a.assessment.rows.filter((r) => r.blockedBy === 'review').length,
      0,
    );
    const dupRows = open.reduce(
      (n, { a }) =>
        n + a.assessment.rows.filter((r) => r.blockedBy === 'duplicate').length,
      0,
    );
    const mismatches = open.filter(
      ({ a }) => a.assessment.reconciliation && !a.assessment.reconciliation.ok,
    );

    const rows: AssistantAnswer['rows'] = [];
    const add = (label: string, n: number, text: string) =>
      n > 0 && rows.push([label, text, 'neg']);
    add(
      'Missing or unreadable required values',
      tally('missing_required'),
      `${plural(tally('missing_required'), 'row')} · left blank, not guessed`,
    );
    add(
      'Low-confidence reads',
      lowRows,
      `${plural(lowRows, 'row')} · check against the original`,
    );
    add(
      'Invalid values',
      tally('invalid'),
      `${plural(tally('invalid'), 'row')}`,
    );
    add(
      'Unmatched products',
      tally('unmatched_product'),
      `${plural(tally('unmatched_product'), 'row')} · may be new or misread`,
    );
    add('Waiting for a duplicate decision', dupRows, plural(dupRows, 'row'));
    for (const { a, s } of mismatches) {
      const rec = a.assessment.reconciliation!;
      rows.push([
        rec.kind === 'ledger' ? 'Unbalanced ledger' : 'Total mismatch',
        `${s.name} · ${formatAmount(Math.abs(rec.difference ?? 0), data.currency)} gap`,
        'neg',
      ]);
    }
    rows.push(['Ready without review', `${plural(clean, 'record')}`, 'pos']);

    return {
      title: 'Which rows need review?',
      answer:
        rowsNeed === 0 && mismatches.length === 0
          ? `Nothing is waiting for a human. ${clean ? `${plural(clean, 'record')} across ${plural(open.length, 'document')} are ready to import.` : 'There are no open documents.'}`
          : `Across ${plural(attention.length, 'open document')}, ${plural(rowsNeed, 'row')} need a human${mismatches.length ? `, and ${plural(mismatches.length, 'document')} ${mismatches.length === 1 ? 'has' : 'have'} arithmetic that does not reconcile` : ''}. The ${plural(clean, 'clean record')} can be imported independently.`,
      rows,
      bullets: [
        'Blank fields are blank because they could not be read — nothing was filled in with a guess',
        'Arithmetic is shown exactly as printed and never adjusted to balance',
        'Nothing in these documents has been written to any module yet',
      ],
      note: 'Extraction and validation never write. Only a confirmed import does.',
      primary: { label: 'Open review queue', href: '/digitizer/review' },
      source: 'data',
    };
  }

  private answerDuplicates(data: Loaded): AssistantAnswer {
    const dups = this.openDocs(data).flatMap(({ a, s }) =>
      a.assessment.rows
        .filter(
          (r) => r.duplicate && r.state !== 'imported' && r.action === 'commit',
        )
        .map((r) => ({ r, s })),
    );
    const strong = dups.filter(({ r }) => r.duplicate!.level === 'high');
    const weak = dups.length - strong.length;
    if (!dups.length) {
      return {
        title: 'Records that already exist',
        answer:
          'None of the extracted records match anything you already have, so there is nothing to merge or skip.',
        rows: [['Auto-merged', 'None — never on ambiguity', 'pos']],
        bullets: [
          'Phone, email and SKU are compared first; a name on its own only ever flags',
        ],
        note: 'Ambiguous records are never auto-merged.',
        primary: null,
        source: 'data',
      };
    }
    return {
      title: 'Records that already exist',
      answer: `${plural(dups.length, 'extracted record')} look like data you already have. ${strong.length} match on a phone, email or SKU (strong evidence)${weak ? `; ${weak} match on name alone, which is weak` : ''}. Noxtill will not merge any of them without you deciding.`,
      rows: [
        ...dups
          .slice(0, 8)
          .map(({ r, s }): [string, string, ('pos' | 'neg' | 'muted')?] => [
            `${r.displayName} · ${s.name}`,
            r.duplicate!.basis,
            r.duplicate!.level === 'low' ? 'neg' : undefined,
          ]),
        ['Match basis', 'Phone, then email, then name'],
        ['Auto-merged', 'None — never on ambiguity', 'pos'],
      ],
      bullets: [
        'A phone or email match is strong evidence; a name match alone is not',
        'Merging two real customers into one is painful to undo, so ambiguity always goes to you',
        'Whichever you choose is recorded against the row',
      ],
      note: 'Ambiguous records are never auto-merged, whatever the confidence threshold is set to.',
      primary: { label: 'Review them', href: '/digitizer/review' },
      source: 'data',
    };
  }

  private answerTotal(data: Loaded): AssistantAnswer {
    const bad = this.openDocs(data).filter(
      ({ a }) => a.assessment.reconciliation && !a.assessment.reconciliation.ok,
    );
    if (!bad.length) {
      return {
        title: "Why doesn't the total match?",
        answer: 'No open document has a total that fails to reconcile.',
        rows: [],
        bullets: [
          'Line items are summed and compared with the printed total for every invoice; ledgers are reconciled the same way',
        ],
        note: 'Noxtill never adjusts a figure to make arithmetic balance.',
        primary: null,
        source: 'data',
      };
    }
    const { a, s } = bad[0];
    const rec = a.assessment.reconciliation!;
    const currency = data.currency;
    const t = a.analysis.totals;
    const unreadable = rec.unreadableLines;
    return {
      title: `Why doesn't ${s.name} match?`,
      answer: `${rec.message} ${unreadable.length ? `${unreadable.length === 1 ? 'One entry has' : `${unreadable.length} entries have`} a value that could not be read (${unreadable.map((u) => `#${u.index} ${u.missing.join('/')}`).join(', ')}), so ${unreadable.length === 1 ? 'its' : 'their'} amount is not in the sum.` : 'Every value was read, so the difference is in the paper or in a misread digit.'} Noxtill will not assume a value to make the numbers balance.`,
      rows: [
        ...rec.components.map((c): [string, string] => [
          c.label,
          formatAmount(c.value, currency),
        ]),
        ['Calculated total', formatAmount(rec.calculated, currency)],
        [
          rec.kind === 'ledger' ? 'Written closing balance' : 'Printed total',
          rec.stated === null ? 'Not read' : formatAmount(rec.stated, currency),
        ],
        [
          'Difference',
          formatAmount(Math.abs(rec.difference ?? 0), currency),
          'neg',
        ],
        ...(t && rec.kind === 'invoice'
          ? [
              [
                'Tax / discount',
                `${t.tax === null ? 'not read' : formatAmount(t.tax, currency)} / ${t.discount === null ? 'not read' : formatAmount(t.discount, currency)}`,
              ] as [string, string],
            ]
          : []),
        ['Figure adjusted by Noxtill', 'None', 'pos'],
      ],
      bullets: [
        'Silently setting an unread value would make the totals agree and could be wrong',
        'A wrong quantity becomes wrong stock and wrong cost the moment it is imported',
        'Correct the figure in the document’s Table tab and the reconciliation re-runs immediately',
      ],
      note: 'Noxtill never adjusts a figure to make arithmetic balance.',
      primary: {
        label: 'Open the document',
        href: `/digitizer/review?batch=${s.id}`,
      },
      source: 'data',
    };
  }

  private answerExtract(data: Loaded): AssistantAnswer {
    const rows = this.openDocs(data).flatMap(({ a }) =>
      a.assessment.rows.filter(
        (r) => r.destination === 'customer' && r.state !== 'imported',
      ),
    );
    const has = (r: (typeof rows)[number], f: string) =>
      !r.fields.find((x) => x.field === f)?.blank;
    const both = rows.filter((r) => has(r, 'name') && has(r, 'phone')).length;
    const nameOnly = rows.filter(
      (r) => has(r, 'name') && !has(r, 'phone'),
    ).length;
    const neither = rows.filter(
      (r) => !has(r, 'name') && !has(r, 'phone'),
    ).length;
    return {
      title: 'Just extract the names and phone numbers',
      answer: rows.length
        ? `${plural(rows.length, 'customer row')} extracted. ${both} have both a name and a phone that read, ${nameOnly} have a name but no phone, and ${neither} have neither. Nothing has been created in Customers, and nothing will be unless you ask for an import.`
        : 'There are no extracted customer rows to list.',
      rows: [
        [
          'Name and phone both readable',
          `${both} rows`,
          both ? 'pos' : undefined,
        ],
        ['Name only', `${nameOnly} rows`],
        ['Neither readable', `${neither} rows`, neither ? 'neg' : undefined],
        ['Records created', 'None', 'pos'],
        ['Duplicates checked', 'Yes — shown in Review'],
      ],
      bullets: [
        'You asked to extract, so Noxtill stopped at extraction',
        'A blank phone is blank because it could not be read — it is never a guess',
      ],
      note: 'Extract means extract. Creating records is a separate, explicit step.',
      primary: { label: 'Open structured data', href: '/digitizer/structured' },
      source: 'data',
    };
  }

  private answerSummary(data: Loaded): AssistantAnswer {
    const first = data.assessed.findIndex(
      (a) => a.batch.status !== 'processing',
    );
    if (first === -1)
      return {
        title: 'Summarize the latest document',
        answer: 'There are no documents to summarize yet.',
        rows: [],
        bullets: [],
        note: '',
        primary: null,
        source: 'data',
      };
    const a = data.assessed[first];
    const s = data.summaries[first];
    const t = a.analysis.totals;
    return {
      title: `Summary of ${s.name}`,
      answer: `${s.nextAction.title}. ${s.nextAction.why}`,
      rows: [
        [
          'Type',
          `${s.kindLabel}${s.kindConfidence ? ` · ${s.kindConfidence} confidence` : ''}`,
        ],
        ['Records', `${s.counts.rows} across ${plural(s.pageCount, 'page')}`],
        ['Confidence', s.confidenceSummary],
        ...(a.analysis.supplier
          ? [['Supplier', a.analysis.supplier] as [string, string]]
          : []),
        ...(a.analysis.invoiceNumber
          ? [['Invoice number', a.analysis.invoiceNumber] as [string, string]]
          : []),
        ...(a.analysis.documentDate
          ? [['Date', a.analysis.documentDate] as [string, string]]
          : []),
        ...(t?.printedTotal !== null && t?.printedTotal !== undefined
          ? [
              [
                'Printed total',
                formatAmount(t.printedTotal, data.currency),
              ] as [string, string],
            ]
          : []),
        ['Status', s.status.replace('_', ' ')],
      ],
      bullets: [`${s.evidence}`],
      note: 'This summary is read from the extracted data, not written by AI.',
      primary: {
        label: 'Open the document',
        href: `/digitizer/review?batch=${s.id}`,
      },
      source: 'data',
    };
  }

  private async answerFree(
    businessId: string,
    question: string,
    data: Loaded,
  ): Promise<AssistantAnswer> {
    const q = question.trim();
    if (!q) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ASSISTANT_UNAVAILABLE,
        'Ask a question about your documents.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const context = data.assessed.slice(0, 40).map((a, i) => {
      const s = data.summaries[i];
      return {
        name: s.name,
        type: s.kindLabel,
        status: s.status,
        pages: s.pageCount,
        uploaded: s.uploadedAt.slice(0, 10),
        records: s.counts.rows,
        confidence: s.confidenceSummary,
        issues: a.assessment.issues.map((x) => `${x.title} (${x.detail})`),
        supplier: a.analysis.supplier,
        invoiceNumber: a.analysis.invoiceNumber,
        date: a.analysis.documentDate,
        printedTotal: a.analysis.totals?.printedTotal ?? null,
        // A bounded sample of rows for the most recent documents only.
        rows:
          i < 6
            ? a.assessment.rows.slice(0, 30).map((r) => ({
                label: r.displayName,
                destination: r.destinationLabel,
                state: r.state,
                values: Object.fromEntries(
                  r.fields
                    .filter((f) => !f.blank)
                    .map((f) => [f.label, f.normalized]),
                ),
              }))
            : undefined,
      };
    });

    let raw: string;
    try {
      const res = await this.aiInfra.createMessage(
        businessId,
        'digitizer_assistant',
        {
          model: DIGITIZER_MODEL,
          temperature: 0,
          maxTokens: 1200,
          system:
            'You answer questions about a small business’s scanned documents using ONLY the JSON context provided. If the context does not contain the answer, say so plainly — never guess or invent a number. Never claim anything was imported or changed. Reply with one JSON object: {"answer": string (2-4 sentences), "bullets": string[] (up to 4 short evidence points)}.',
          messages: [
            {
              role: 'user',
              content: `Currency: ${data.currency}\nContext:\n${JSON.stringify(context)}\n\nQuestion: ${q}`,
            },
          ],
        },
      );
      raw = res.content.find((b) => b.type === 'text')?.text ?? '';
    } catch (error) {
      this.logger.warn(
        `Digitizer assistant failed: ${(error as Error).message}`,
      );
      throw new AppException(
        DIGITIZER_ERROR_CODES.ASSISTANT_UNAVAILABLE,
        'The assistant is not available right now — try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let answer = raw.trim();
    let bullets: string[] = [];
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as {
          answer?: unknown;
          bullets?: unknown;
        };
        if (typeof parsed.answer === 'string') answer = parsed.answer;
        if (Array.isArray(parsed.bullets))
          bullets = parsed.bullets
            .filter((b): b is string => typeof b === 'string')
            .slice(0, 4);
      } catch {
        /* fall back to the raw text */
      }
    }
    return {
      title: q.length > 80 ? `${q.slice(0, 77)}…` : q,
      answer,
      rows: [],
      bullets,
      note: 'Answered by AI from a summary of your documents. Check anything important against the original.',
      primary: null,
      source: 'ai',
    };
  }
}
