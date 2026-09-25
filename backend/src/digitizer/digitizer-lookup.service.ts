import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import { DigitizerRow } from './digitizer.types';
import {
  DuplicateInfo,
  DuplicateMatch,
  ProductMatch,
  RowLookup,
  isBlank,
  parseAmount,
  parseIsoDate,
} from './digitizer-rules';

export interface LookupFlags {
  matchOnPhone: boolean;
  matchOnEmail: boolean;
  flagNameOnlyMatch: boolean;
}

export interface LookupInput {
  docId: string;
  row: DigitizerRow;
}

const text = (v: unknown): string | null =>
  isBlank(v) ? null : String(v).trim();
const lower = (v: string | null): string | null =>
  v === null ? null : v.toLowerCase();

/**
 * Compares scanned rows against what the business already has — one query per table for the whole
 * set of rows, never one per row. The duplicate rule mirrors the design: phone, then email, are
 * strong identifiers; a name on its own is weak and only ever flags, never blocks or merges.
 */
@Injectable()
export class DigitizerLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(
    businessId: string,
    country: string | null,
    flags: LookupFlags,
    inputs: LookupInput[],
  ): Promise<Map<string, RowLookup>> {
    const out = new Map<string, RowLookup>();
    // Rows that already imported must not "match themselves" against the record they created.
    const live = inputs.filter(
      ({ row }) => !row.result || row.result.status === 'failed',
    );
    for (const { row } of inputs)
      out.set(row.id, {
        duplicate: null,
        product: null,
        existingCustomer: null,
      });

    const phoneOf = (row: DigitizerRow): string | null => {
      const raw = text(row.data.phone);
      return raw
        ? (normalizePhoneE164(raw, country ?? undefined) ?? null)
        : null;
    };

    const byDest = (...d: string[]) =>
      live.filter(({ row }) => d.includes(row.destination));

    // ── people: customers (and credit rows, which attach to a customer) ──
    const customerRows = byDest('customer', 'credit_opening_balance');
    if (customerRows.length) {
      const phones = uniq(customerRows.map(({ row }) => phoneOf(row)));
      const emails = uniq(
        customerRows.map(({ row }) => lower(text(row.data.email))),
      );
      const names = uniq(
        customerRows.map(({ row }) =>
          text(row.data.name ?? row.data.customerName),
        ),
      );
      const existing = await this.prisma.customer.findMany({
        where: {
          businessId,
          OR: [
            ...(phones.length ? [{ phone: { in: phones } }] : []),
            ...(emails.length ? [{ email: { in: emails } }] : []),
            ...(names.length ? [{ name: { in: names } }] : []),
          ],
        },
        select: { id: true, name: true, phone: true, email: true },
        take: 5000,
      });
      for (const { row } of customerRows) {
        const info = matchPerson(
          'Customers',
          phoneOf(row),
          lower(text(row.data.email)),
          text(row.data.name ?? row.data.customerName),
          existing,
          flags,
        );
        const slot = out.get(row.id)!;
        if (row.destination === 'credit_opening_balance')
          slot.existingCustomer = info?.existing ?? null;
        else slot.duplicate = info;
      }
    }

    // ── people: suppliers ──
    const supplierRows = byDest('supplier');
    if (supplierRows.length) {
      const phones = uniq(supplierRows.map(({ row }) => phoneOf(row)));
      const emails = uniq(
        supplierRows.map(({ row }) => lower(text(row.data.email))),
      );
      const names = uniq(supplierRows.map(({ row }) => text(row.data.name)));
      const existing = await this.prisma.supplier.findMany({
        where: {
          businessId,
          OR: [
            ...(phones.length ? [{ phone: { in: phones } }] : []),
            ...(emails.length ? [{ email: { in: emails } }] : []),
            ...(names.length ? [{ name: { in: names } }] : []),
          ],
        },
        select: { id: true, name: true, phone: true, email: true },
        take: 5000,
      });
      for (const { row } of supplierRows) {
        out.get(row.id)!.duplicate = matchPerson(
          'Suppliers',
          phoneOf(row),
          lower(text(row.data.email)),
          text(row.data.name),
          existing.map((s) => ({ ...s, phone: s.phone, email: s.email })),
          flags,
        );
      }
    }

    // ── products (new products) and inventory (stock counts) ──
    const productRows = byDest('product', 'inventory');
    if (productRows.length) {
      const skus = uniq(productRows.map(({ row }) => skuOf(row)));
      const names = uniq(productRows.map(({ row }) => text(row.data.name)));
      const existing = await this.prisma.product.findMany({
        where: {
          businessId,
          kind: 'product',
          OR: [
            ...(skus.length ? [{ sku: { in: skus } }] : []),
            ...(names.length ? [{ name: { in: names } }] : []),
          ],
        },
        select: { id: true, name: true, sku: true, stockQty: true },
        take: 5000,
      });
      const bySku = new Map(
        existing.filter((p) => p.sku).map((p) => [p.sku!.toUpperCase(), p]),
      );
      const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
      for (const { row } of productRows) {
        const sku = skuOf(row);
        const name = lower(text(row.data.name));
        const skuHit = sku ? bySku.get(sku) : undefined;
        const nameHit = name ? byName.get(name) : undefined;
        const hit = skuHit ?? nameHit;
        const slot = out.get(row.id)!;
        if (row.destination === 'inventory') {
          slot.product = hit ? toProduct(hit) : null;
        } else if (hit) {
          const bySkuMatch = Boolean(skuHit);
          slot.duplicate = {
            level: bySkuMatch ? 'high' : 'low',
            entity: 'Products',
            basis: bySkuMatch
              ? 'SKU matches an existing product.'
              : 'Name matches an existing product but there is no matching SKU.',
            phoneMatch: false,
            emailMatch: false,
            nameMatch: true,
            existing: {
              id: hit.id,
              name: hit.name,
              phone: null,
              email: null,
              sku: hit.sku,
            },
          };
        }
      }
    }

    // ── expenses: same date, amount and description as one already recorded ──
    const expenseRows = byDest('expense');
    if (expenseRows.length) {
      const amounts = uniq(
        expenseRows.map(({ row }) => parseAmount(row.data.amount)),
      );
      const dates = uniq(
        expenseRows.map(
          ({ row }) =>
            parseIsoDate(row.data.incurredOn)?.toISOString().slice(0, 10) ??
            null,
        ),
      );
      if (amounts.length && dates.length) {
        const existing = await this.prisma.expense.findMany({
          where: {
            businessId,
            amount: { in: amounts },
            incurredOn: {
              in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)),
            },
          },
          select: {
            id: true,
            description: true,
            amount: true,
            incurredOn: true,
          },
          take: 5000,
        });
        for (const { row } of expenseRows) {
          const amount = parseAmount(row.data.amount);
          const day = parseIsoDate(row.data.incurredOn)
            ?.toISOString()
            .slice(0, 10);
          const description = lower(text(row.data.description));
          if (amount === null || !day || !description) continue;
          const hit = existing.find(
            (e) =>
              Number(e.amount) === amount &&
              e.incurredOn.toISOString().slice(0, 10) === day &&
              e.description.trim().toLowerCase() === description,
          );
          if (hit) {
            out.get(row.id)!.duplicate = {
              level: 'high',
              entity: 'Expenses',
              basis:
                'An expense with the same date, amount and description already exists.',
              phoneMatch: false,
              emailMatch: false,
              nameMatch: true,
              existing: {
                id: hit.id,
                name: hit.description,
                phone: null,
                email: null,
              },
            };
          }
        }
      }
    }

    this.flagRepeatsWithinDocuments(live, out, phoneOf);
    return out;
  }

  /** Two rows in the same scan with the same phone would collide on import — the later one is flagged. */
  private flagRepeatsWithinDocuments(
    live: LookupInput[],
    out: Map<string, RowLookup>,
    phoneOf: (row: DigitizerRow) => string | null,
  ) {
    const seen = new Map<string, { id: string; name: string }>();
    for (const { docId, row } of live) {
      if (row.destination !== 'customer' && row.destination !== 'supplier')
        continue;
      if (row.action === 'skip') continue;
      const phone = phoneOf(row);
      if (!phone) continue;
      const key = `${docId}|${row.destination}|${phone}`;
      const earlier = seen.get(key);
      const name = text(row.data.name) ?? phone;
      if (!earlier) {
        seen.set(key, { id: row.id, name });
        continue;
      }
      const slot = out.get(row.id)!;
      if (slot.duplicate) continue;
      slot.duplicate = {
        level: 'high',
        entity: row.destination === 'customer' ? 'Customers' : 'Suppliers',
        basis: `The same phone number appears earlier in this document (${earlier.name}).`,
        phoneMatch: true,
        emailMatch: false,
        nameMatch: earlier.name.toLowerCase() === name.toLowerCase(),
        existing: {
          id: `row:${earlier.id}`,
          name: earlier.name,
          phone,
          email: null,
        },
      };
    }
  }
}

function uniq<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null))];
}

function skuOf(row: DigitizerRow): string | null {
  const s = text(row.data.sku);
  return s ? s.replace(/\s+/g, '').toUpperCase() : null;
}

function toProduct(p: {
  id: string;
  name: string;
  sku: string | null;
  stockQty: number;
}): ProductMatch {
  return { id: p.id, name: p.name, sku: p.sku, stockQty: p.stockQty };
}

interface Person {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

function matchPerson(
  entity: 'Customers' | 'Suppliers',
  phone: string | null,
  email: string | null,
  name: string | null,
  candidates: Person[],
  flags: LookupFlags,
): DuplicateInfo | null {
  const noun = entity === 'Customers' ? 'customer' : 'supplier';
  const score = (c: Person) => {
    const phoneMatch =
      flags.matchOnPhone && phone !== null && c.phone === phone;
    const emailMatch =
      flags.matchOnEmail &&
      email !== null &&
      (c.email ?? '').toLowerCase() === email;
    const nameMatch =
      name !== null && c.name.trim().toLowerCase() === name.toLowerCase();
    return {
      phoneMatch,
      emailMatch,
      nameMatch,
      rank: (phoneMatch ? 4 : 0) + (emailMatch ? 2 : 0) + (nameMatch ? 1 : 0),
    };
  };

  let best: { c: Person; s: ReturnType<typeof score> } | null = null;
  for (const c of candidates) {
    const s = score(c);
    if (s.rank === 0) continue;
    if (!best || s.rank > best.s.rank) best = { c, s };
  }
  if (!best) return null;

  const { phoneMatch, emailMatch, nameMatch } = best.s;
  const strong = phoneMatch || emailMatch;
  if (!strong && !flags.flagNameOnlyMatch) return null;

  let basis: string;
  if (phoneMatch && nameMatch)
    basis = `Phone and name both match an existing ${noun} exactly.`;
  else if (phoneMatch)
    basis = `Phone matches an existing ${noun}, but the name is different.`;
  else if (emailMatch)
    basis = `Email matches an existing ${noun}${nameMatch ? ' and so does the name' : ''}.`;
  else if (phone)
    basis =
      'Name matches, phone does not. A common name — probably a different person.';
  else
    basis = `Name matches an existing ${noun}; there is no phone to compare.`;

  const existing: DuplicateMatch = {
    id: best.c.id,
    name: best.c.name,
    phone: best.c.phone,
    email: best.c.email,
  };
  return {
    level: strong ? 'high' : 'low',
    entity,
    basis,
    phoneMatch,
    emailMatch,
    nameMatch,
    existing,
  };
}
