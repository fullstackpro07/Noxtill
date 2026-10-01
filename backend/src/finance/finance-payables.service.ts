import { HttpStatus, Injectable } from '@nestjs/common';
import { FinBill, FinBillLine, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  num,
  r2,
  ymd,
} from './finance-context.service';
import { FinancePostingService, LineInput } from './finance-posting.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceBankingService } from './finance-banking.service';
import { FIN_ERRORS } from './finance.constants';

export interface BillInput {
  vendorName: string;
  supplierId?: string | null;
  vendorInvoiceNo?: string | null;
  billDate: string;
  dueDate: string;
  purchaseOrderId?: string | null;
  branchId?: string | null;
  currency?: string;
  notes?: string;
  intake?: string;
  ocr?: Prisma.InputJsonValue;
  attachment?: { key: string; name: string; size: number; type: string } | null;
  lines: {
    description: string;
    accountId: string;
    qty?: number;
    unitCost?: number;
    amount?: number;
    taxCode?: string | null;
    taxAmount?: number | null;
    poItemId?: string | null;
    productId?: string | null;
    department?: string | null;
  }[];
}

export type BillWithLines = FinBill & { lines: FinBillLine[] };

const QTY_TOL = 0.02;
const PRICE_TOL = 0.01;

/** Vendor bills (A/P). Every bill is reviewed and approved before it posts; payments are recorded here. */
@Injectable()
export class FinancePayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly posting: FinancePostingService,
    private readonly journals: FinanceJournalsService,
    private readonly banking: FinanceBankingService,
  ) {}

  async mustBill(rootId: string, id: string): Promise<BillWithLines> {
    const b = await this.prisma.finBill.findFirst({
      where: { id, businessId: rootId },
      include: { lines: true },
    });
    if (!b)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Bill not found',
        HttpStatus.NOT_FOUND,
      );
    return b;
  }

  /** Suppliers across the group (a bill can name any of them). */
  async suppliers(rootId: string) {
    const ids = (await this.ctx.branches(rootId)).map((b) => b.id);
    return this.prisma.supplier.findMany({
      where: { businessId: { in: ids } },
      select: { id: true, name: true, businessId: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Purchase orders that can be billed, with what was ordered and received per line. */
  async purchaseOrders(rootId: string) {
    const ids = (await this.ctx.branches(rootId)).map((b) => b.id);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        businessId: { in: ids },
        status: { in: ['sent', 'confirmed', 'partially_received', 'received'] },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return pos.map((p) => ({
      id: p.id,
      ref: `PO-${p.id.slice(0, 6).toUpperCase()}`,
      status: p.status,
      businessId: p.businessId,
      supplier: p.supplier,
      createdAt: p.createdAt,
      items: p.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.product.name,
        qtyOrdered: i.qtyOrdered,
        qtyReceived: i.qtyReceived,
        unitCost: num(i.unitCost),
      })),
    }));
  }

  // ── matching & checks ────────────────────────────────────────────────────

  private async duplicates(
    rootId: string,
    b: {
      id?: string;
      vendorInvoiceNo?: string | null;
      supplierId?: string | null;
      vendorName: string;
    },
  ) {
    if (!b.vendorInvoiceNo) return [];
    const rows = await this.prisma.finBill.findMany({
      where: {
        businessId: rootId,
        status: { notIn: ['Voided', 'Rejected'] },
        vendorInvoiceNo: b.vendorInvoiceNo,
        ...(b.id ? { NOT: { id: b.id } } : {}),
      },
      select: {
        id: true,
        number: true,
        vendorName: true,
        supplierId: true,
        total: true,
      },
    });
    return rows.filter((r) =>
      b.supplierId && r.supplierId
        ? r.supplierId === b.supplierId
        : r.vendorName.trim().toLowerCase() ===
          b.vendorName.trim().toLowerCase(),
    );
  }

  /** Three-way match: bill quantity and price vs the PO and what was actually received. */
  private async threeWay(
    rootId: string,
    poId: string | null,
    lines: { poItemId?: string | null; qty: number; unitCost: number }[],
  ) {
    if (!poId)
      return { status: 'No PO', rows: [] as Record<string, string | number>[] };
    const ids = (await this.ctx.branches(rootId)).map((b) => b.id);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, businessId: { in: ids } },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!po)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Purchase order not found',
        HttpStatus.NOT_FOUND,
      );
    const rows: Record<string, string | number>[] = [];
    let ok = true;
    for (const it of po.items) {
      const billed = lines.filter((l) => l.poItemId === it.id);
      const bq = billed.reduce((a, l) => a + l.qty, 0);
      const bp = billed.length ? billed[0].unitCost : 0;
      const qtyOk =
        it.qtyReceived === 0
          ? bq === 0
          : Math.abs(bq - it.qtyReceived) / it.qtyReceived <= QTY_TOL;
      const pp = num(it.unitCost);
      const priceOk =
        !billed.length ||
        (pp === 0 ? bp === 0 : Math.abs(bp - pp) / pp <= PRICE_TOL);
      if (!billed.length && it.qtyReceived === 0) continue;
      if (!qtyOk || !priceOk) ok = false;
      rows.push({
        item: it.product.name,
        ordered: it.qtyOrdered,
        received: it.qtyReceived,
        billed: bq,
        poPrice: pp,
        billPrice: r2(bp),
        result: !qtyOk
          ? 'Qty Exception'
          : !priceOk
            ? 'Price Exception'
            : 'Match',
      });
    }
    return {
      status: ok ? 'Matched' : 'Variance',
      rows,
      poRef: `PO-${po.id.slice(0, 6).toUpperCase()}`,
    };
  }

  private async computeLines(rootId: string, dto: BillInput) {
    const codes = await this.prisma.finTaxCode.findMany({
      where: { businessId: rootId, active: true },
    });
    const byCode = new Map(codes.map((c) => [c.code, c]));
    const accts = await this.prisma.finAccount.findMany({
      where: {
        businessId: rootId,
        id: { in: dto.lines.map((l) => l.accountId) },
      },
    });
    const accById = new Map(accts.map((a) => [a.id, a]));
    return dto.lines.map((l) => {
      const a = accById.get(l.accountId);
      if (!a || a.isHeader || !a.active)
        throw new AppException(
          FIN_ERRORS.INVALID,
          `“${l.description}”: choose an active, postable account.`,
          HttpStatus.BAD_REQUEST,
        );
      const qty = Number(l.qty ?? 1) || 1;
      const unit = Number(
        l.unitCost ?? (l.amount != null ? Number(l.amount) / qty : 0),
      );
      const amount = r2(l.amount != null ? Number(l.amount) : qty * unit);
      const tc = l.taxCode ? byCode.get(l.taxCode) : null;
      if (l.taxCode && !tc)
        throw new AppException(
          FIN_ERRORS.INVALID,
          `Tax code ${l.taxCode} doesn’t exist.`,
          HttpStatus.BAD_REQUEST,
        );
      const taxAmount = r2(
        l.taxAmount != null
          ? Number(l.taxAmount)
          : tc
            ? (amount * num(tc.rate)) / 100
            : 0,
      );
      return {
        description: l.description.slice(0, 300),
        accountId: a.id,
        qty,
        unitCost: unit,
        amount,
        taxCode: l.taxCode ?? null,
        taxAmount,
        poItemId: l.poItemId ?? null,
        productId: l.productId ?? null,
        department: l.department ?? null,
      };
    });
  }

  /** Live check for the bill form: other bills with the same vendor invoice number. */
  async checkDuplicate(
    rootId: string,
    vendorName: string,
    supplierId: string | null,
    vendorInvoiceNo: string,
    excludeId?: string,
  ) {
    if (!vendorInvoiceNo?.trim()) return [];
    return this.duplicates(rootId, {
      id: excludeId,
      vendorInvoiceNo: vendorInvoiceNo.trim(),
      supplierId,
      vendorName,
    });
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async create(actor: FinActor, dto: BillInput) {
    this.ctx.need(actor, 'manage', 'Adding a bill');
    const rootId = actor.rootId;
    if (!dto.lines?.length)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'A bill needs at least one line.',
        HttpStatus.BAD_REQUEST,
      );
    const base = await this.ctx.baseCurrency(rootId);
    const currency = (dto.currency || base).toUpperCase();
    const billDate = dayOf(dto.billDate);
    const dueDate = dayOf(dto.dueDate);
    if (dueDate < billDate)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'The due date is before the bill date.',
        HttpStatus.BAD_REQUEST,
      );
    const fxRate = await this.ctx.mustRate(rootId, currency, billDate);
    const lines = await this.computeLines(rootId, dto);
    const subtotal = r2(lines.reduce((a, l) => a + l.amount, 0));
    const tax = r2(lines.reduce((a, l) => a + l.taxAmount, 0));
    const match = await this.threeWay(
      rootId,
      dto.purchaseOrderId ?? null,
      lines,
    );
    const cfg = await this.ctx.config(rootId);
    const dups = cfg.posting.dupBill ? await this.duplicates(rootId, dto) : [];
    const bill = await this.prisma.$transaction(async (tx) => {
      const number = await this.ctx.nextNumber(
        tx,
        rootId,
        'bill',
        billDate.getUTCFullYear(),
      );
      return tx.finBill.create({
        data: {
          businessId: rootId,
          number,
          supplierId: dto.supplierId ?? null,
          vendorName: dto.vendorName.slice(0, 160),
          vendorInvoiceNo: dto.vendorInvoiceNo?.trim().slice(0, 80) || null,
          billDate,
          dueDate,
          purchaseOrderId: dto.purchaseOrderId ?? null,
          branchId: dto.branchId ?? null,
          currency,
          fxRate,
          subtotal,
          tax,
          total: r2(subtotal + tax),
          status:
            dups.length || match.status === 'Variance'
              ? 'Review Required'
              : 'Draft',
          matchStatus: match.status,
          matchDetail: {
            rows: match.rows,
            duplicateOf: dups.map((d) => d.number),
            poRef: (match as { poRef?: string }).poRef ?? null,
          },
          intake: dto.intake ?? 'Manual',
          ocr: dto.ocr,
          attachments: dto.attachment
            ? [
                {
                  ...dto.attachment,
                  by: actor.name,
                  at: new Date().toISOString(),
                },
              ]
            : [],
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: { create: lines.map((l) => ({ ...l, businessId: rootId })) },
        },
        include: { lines: true },
      });
    });
    await this.ctx.audit(
      rootId,
      actor,
      'bill.created',
      'bill',
      bill.id,
      `${bill.number} via ${bill.intake}${dups.length ? ` — possible duplicate of ${dups.map((d) => d.number).join(', ')}` : ''}`,
    );
    return bill;
  }

  async update(actor: FinActor, id: string, dto: BillInput) {
    this.ctx.need(actor, 'manage', 'Editing a bill');
    const b = await this.mustBill(actor.rootId, id);
    if (!['Draft', 'Review Required', 'Rejected'].includes(b.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} is ${b.status} — only draft bills can be edited.`,
        HttpStatus.CONFLICT,
      );
    const lines = await this.computeLines(actor.rootId, dto);
    const subtotal = r2(lines.reduce((a, l) => a + l.amount, 0));
    const tax = r2(lines.reduce((a, l) => a + l.taxAmount, 0));
    const match = await this.threeWay(
      actor.rootId,
      dto.purchaseOrderId ?? null,
      lines,
    );
    const cfg = await this.ctx.config(actor.rootId);
    const dups = cfg.posting.dupBill
      ? await this.duplicates(actor.rootId, { ...dto, id })
      : [];
    const billDate = dayOf(dto.billDate);
    const currency = (dto.currency || b.currency).toUpperCase();
    const fxRate = await this.ctx.mustRate(actor.rootId, currency, billDate);
    await this.prisma.$transaction(async (tx) => {
      await tx.finBillLine.deleteMany({ where: { billId: id } });
      await tx.finBill.update({
        where: { id },
        data: {
          supplierId: dto.supplierId ?? null,
          vendorName: dto.vendorName.slice(0, 160),
          vendorInvoiceNo: dto.vendorInvoiceNo?.trim().slice(0, 80) || null,
          billDate,
          dueDate: dayOf(dto.dueDate),
          purchaseOrderId: dto.purchaseOrderId ?? null,
          branchId: dto.branchId ?? null,
          currency,
          fxRate,
          subtotal,
          tax,
          total: r2(subtotal + tax),
          status:
            dups.length || match.status === 'Variance'
              ? 'Review Required'
              : 'Draft',
          matchStatus: match.status,
          matchDetail: {
            rows: match.rows,
            duplicateOf: dups.map((d) => d.number),
            poRef: (match as { poRef?: string }).poRef ?? null,
          },
          notes: dto.notes ?? b.notes,
          rejectReason: null,
          approvedById: null,
          approvedAt: null,
          lines: {
            create: lines.map((l) => ({ ...l, businessId: actor.rootId })),
          },
        },
      });
      await tx.finApproval.updateMany({
        where: {
          businessId: actor.rootId,
          subjectType: 'bill',
          subjectId: id,
          status: 'Pending',
        },
        data: { status: 'Cancelled' },
      });
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.edited',
      'bill',
      id,
      `${b.number} edited`,
    );
    return this.mustBill(actor.rootId, id);
  }

  /** Reviewer confirms a flagged duplicate / match variance is fine. */
  async clearReview(actor: FinActor, id: string, note: string) {
    this.ctx.need(actor, 'manage', 'Clearing a review flag');
    const b = await this.mustBill(actor.rootId, id);
    if (b.status !== 'Review Required')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} isn’t flagged for review.`,
        HttpStatus.CONFLICT,
      );
    const detail = (b.matchDetail ?? {}) as Record<string, unknown>;
    await this.prisma.finBill.update({
      where: { id },
      data: {
        status: 'Draft',
        matchDetail: {
          ...detail,
          reviewedBy: actor.name,
          reviewNote: note.slice(0, 300),
        },
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.review_cleared',
      'bill',
      id,
      note,
    );
  }

  approvalLevelOf(b: FinBill, threshold: number) {
    return num(b.total) * num(b.fxRate) > threshold ? 'admin' : 'approve';
  }

  async submit(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Submitting a bill');
    const b = await this.mustBill(actor.rootId, id);
    if (b.status === 'Review Required')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} has a possible duplicate or match exception — review it first.`,
        HttpStatus.CONFLICT,
      );
    if (!['Draft', 'Rejected'].includes(b.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} is ${b.status}.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    const level = this.approvalLevelOf(b, cfg.thresholds.billOwner);
    await this.prisma.$transaction(async (tx) => {
      await tx.finBill.update({
        where: { id },
        data: { status: 'Draft', rejectReason: null },
      });
      await this.journals.requestApproval(
        actor.rootId,
        actor,
        {
          subjectType: 'bill',
          subjectId: id,
          title: `${b.number} · ${b.vendorName}`,
          amount: num(b.total),
          rule:
            level === 'admin'
              ? `Vendor bill above ${cfg.thresholds.billOwner.toFixed(2)} — Owner / Controller approval`
              : 'Vendor bill — Finance Manager approval',
          level,
        },
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.submitted',
      'bill',
      id,
      `${b.number} submitted for approval`,
    );
  }

  async approve(actor: FinActor, id: string, comment?: string) {
    const b = await this.mustBill(actor.rootId, id);
    const pending = await this.journals.pendingApproval(
      actor.rootId,
      'bill',
      id,
    );
    if (!pending)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} isn’t waiting for approval.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    const level = this.approvalLevelOf(b, cfg.thresholds.billOwner);
    // sod2: the creator of a bill above the threshold may not approve it.
    this.journals.assertCanApprove(
      actor,
      level,
      b.createdById,
      cfg.sod.sod2 && level === 'admin',
      `Approving ${b.number}`,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBill.update({
        where: { id },
        data: {
          approvedById: actor.userId,
          approvedAt: new Date(),
          status: 'Approved',
        },
      });
      await this.journals.decide(
        actor.rootId,
        'bill',
        id,
        'Approved',
        actor,
        comment,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.approved',
      'bill',
      id,
      `${b.number} approved`,
    );
  }

  async reject(actor: FinActor, id: string, reason: string) {
    this.ctx.need(actor, 'approve', 'Rejecting a bill');
    const b = await this.mustBill(actor.rootId, id);
    if (
      [
        'Posted',
        'Partially Paid',
        'Paid',
        'Approved for Payment',
        'On Hold',
        'Voided',
      ].includes(b.status)
    )
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} is ${b.status}.`,
        HttpStatus.CONFLICT,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBill.update({
        where: { id },
        data: {
          status: 'Rejected',
          rejectReason: reason.slice(0, 300),
          approvedById: null,
          approvedAt: null,
        },
      });
      await this.journals.decide(
        actor.rootId,
        'bill',
        id,
        'Rejected',
        actor,
        reason,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.rejected',
      'bill',
      id,
      reason,
    );
  }

  /** Dr expense / GRNI lines + input tax, Cr A/P. */
  async post(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Posting a bill');
    const b = await this.mustBill(actor.rootId, id);
    if (b.status !== 'Approved' || !b.approvedById)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} must be approved before it posts.`,
        HttpStatus.CONFLICT,
      );
    const maps = await this.ctx.accountMaps(actor.rootId);
    const lines: LineInput[] = b.lines.map((l) => ({
      accountId: l.accountId,
      debit: num(l.amount),
      credit: 0,
      description: l.description,
      supplierId: b.supplierId,
      department: l.department,
      branchId: b.branchId,
    }));
    if (num(b.tax))
      lines.push({
        accountId: maps.byKey.get('input_tax')!.id,
        debit: num(b.tax),
        credit: 0,
        description: `Input tax · ${b.number}`,
        taxCode: 'IN',
        branchId: b.branchId,
      });
    lines.push({
      accountId: maps.byKey.get('ap')!.id,
      debit: 0,
      credit: num(b.total),
      description: `${b.vendorName} · ${b.number}`,
      supplierId: b.supplierId,
      branchId: b.branchId,
    });
    const res = await this.posting.postSystem(
      actor.rootId,
      {
        type: 'bill',
        id: b.id,
        event: 'post',
        hash: `${num(b.total)}|${b.updatedAt.toISOString()}`,
        label: `Bill ${b.number} · ${b.vendorName}`,
      },
      {
        date: b.billDate,
        currency: b.currency,
        fxRate: num(b.fxRate),
        branchId: b.branchId,
        memo: `Bill ${b.number} · ${b.vendorName}${b.vendorInvoiceNo ? ` · inv ${b.vendorInvoiceNo}` : ''}`,
        reference: b.number,
        lines,
      },
    );
    const j = await this.prisma.finJournal.findFirst({
      where: {
        businessId: actor.rootId,
        sourceType: 'bill',
        sourceId: b.id,
        superseded: false,
      },
      orderBy: { sourceRev: 'desc' },
    });
    if (res === 'failed' || !j || j.status !== 'Posted')
      throw new AppException(
        FIN_ERRORS.INVALID,
        `Posting failed: ${j?.failureReason ?? 'validation failed'}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.finBill.update({
      where: { id },
      data: { status: 'Posted', journalId: j.id, postedAt: new Date() },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.posted',
      'bill',
      id,
      `${b.number} posted as ${j.number}`,
    );
    return j;
  }

  async approveForPayment(actor: FinActor, id: string) {
    this.ctx.need(actor, 'approve', 'Approving a bill for payment');
    const b = await this.mustBill(actor.rootId, id);
    if (!['Posted', 'Partially Paid'].includes(b.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} is ${b.status}.`,
        HttpStatus.CONFLICT,
      );
    await this.prisma.finBill.update({
      where: { id },
      data: { status: 'Approved for Payment' },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.approved_for_payment',
      'bill',
      id,
    );
  }

  async hold(actor: FinActor, id: string, on: boolean, reason?: string) {
    this.ctx.need(
      actor,
      on ? 'manage' : 'approve',
      on ? 'Holding a bill' : 'Releasing a hold',
    );
    const b = await this.mustBill(actor.rootId, id);
    if (
      on &&
      !['Posted', 'Partially Paid', 'Approved for Payment'].includes(b.status)
    )
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Only posted, unpaid bills can be held.',
        HttpStatus.CONFLICT,
      );
    if (!on && b.status !== 'On Hold')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} isn’t on hold.`,
        HttpStatus.CONFLICT,
      );
    await this.prisma.finBill.update({
      where: { id },
      data: on
        ? { status: 'On Hold', holdReason: reason?.slice(0, 300) ?? null }
        : {
            status: num(b.amountPaid) > 0 ? 'Partially Paid' : 'Posted',
            holdReason: null,
          },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      on ? 'bill.held' : 'bill.hold_released',
      'bill',
      id,
      reason,
    );
  }

  async void(actor: FinActor, id: string, reason: string) {
    this.ctx.need(actor, 'approve', 'Voiding a bill');
    const b = await this.mustBill(actor.rootId, id);
    if (num(b.amountPaid) > 0)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.number} has payments — void those first.`,
        HttpStatus.CONFLICT,
      );
    if (b.status === 'Voided')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Already voided.',
        HttpStatus.CONFLICT,
      );
    if (b.journalId)
      await this.posting.postSystem(
        actor.rootId,
        {
          type: 'bill',
          id: b.id,
          event: 'post',
          hash: `void-${Date.now()}`,
          label: `Bill ${b.number} voided — ${reason}`,
        },
        {
          date: new Date(),
          currency: b.currency,
          fxRate: num(b.fxRate),
          branchId: b.branchId,
          memo: '',
          lines: [],
        },
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBill.update({
        where: { id },
        data: {
          status: 'Voided',
          notes: `${b.notes ? b.notes + '\n' : ''}Voided: ${reason}`,
        },
      });
      await tx.finApproval.updateMany({
        where: {
          businessId: actor.rootId,
          subjectType: 'bill',
          subjectId: id,
          status: 'Pending',
        },
        data: { status: 'Cancelled' },
      });
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.voided',
      'bill',
      id,
      reason,
    );
  }

  /**
   * Record a payment made outside Noxtill (bank transfer, cheque, cash). Relieves A/P at the
   * bill's rate, credits the bank at the payment date's rate and books any difference as FX.
   */
  async recordPayment(
    actor: FinActor,
    id: string,
    dto: {
      bankAccountId: string;
      date: string;
      amount: number;
      reference?: string;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Recording a bill payment');
    const b = await this.mustBill(actor.rootId, id);
    if (
      !['Posted', 'Partially Paid', 'Approved for Payment'].includes(b.status)
    )
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        b.status === 'On Hold'
          ? `${b.number} is on hold: ${b.holdReason ?? ''}`
          : `${b.number} is ${b.status} — post it first.`,
        HttpStatus.CONFLICT,
      );
    const open = r2(num(b.total) - num(b.amountPaid));
    const amount = r2(dto.amount);
    if (amount <= 0 || amount > open)
      throw new AppException(
        FIN_ERRORS.INVALID,
        `Enter an amount between 0.01 and the open balance ${open.toFixed(2)}.`,
        HttpStatus.BAD_REQUEST,
      );
    const bank = await this.banking.mustAccount(
      actor.rootId,
      dto.bankAccountId,
    );
    const base = await this.ctx.baseCurrency(actor.rootId);
    if (bank.currency !== b.currency && bank.currency !== base)
      throw new AppException(
        FIN_ERRORS.INVALID,
        `${bank.name} is ${bank.currency}; this bill is ${b.currency}. Pay from a ${b.currency} or ${base} account.`,
        HttpStatus.BAD_REQUEST,
      );
    const date = dayOf(dto.date);
    const payRate = await this.ctx.mustRate(actor.rootId, b.currency, date);
    const maps = await this.ctx.accountMaps(actor.rootId);
    const apBase = r2(amount * num(b.fxRate));
    const bankBase = r2(amount * payRate);
    const fx = r2(apBase - bankBase);
    const journalCurrency = bank.currency;
    const jRate = bank.currency === b.currency ? payRate : 1;
    const bankTxn = bank.currency === b.currency ? amount : bankBase;
    const lines: LineInput[] = [
      {
        accountId: maps.byKey.get('ap')!.id,
        debit: bank.currency === b.currency ? amount : apBase,
        credit: 0,
        baseDebit: apBase,
        description: `${b.vendorName} · ${b.number}`,
        supplierId: b.supplierId,
        branchId: b.branchId,
      },
      {
        accountId: bank.glAccountId,
        debit: 0,
        credit: bankTxn,
        baseCredit: bankBase,
        description: `Payment ${b.number}${dto.reference ? ` · ${dto.reference}` : ''}`,
        branchId: b.branchId,
      },
    ];
    if (fx)
      lines.push(
        fx > 0
          ? {
              accountId: maps.byKey.get('fx')!.id,
              debit: 0,
              credit: 0,
              baseCredit: fx,
              description: `Realized FX gain · ${b.number}`,
            }
          : {
              accountId: maps.byKey.get('fx')!.id,
              debit: 0,
              credit: 0,
              baseDebit: -fx,
              description: `Realized FX loss · ${b.number}`,
            },
      );
    const pay = await this.prisma.finBillPayment.create({
      data: {
        businessId: actor.rootId,
        billId: id,
        bankAccountId: bank.id,
        date,
        amount,
        fxRate: payRate,
        reference: dto.reference?.slice(0, 80) ?? null,
        createdById: actor.userId,
      },
    });
    const res = await this.posting.postSystem(
      actor.rootId,
      {
        type: 'billpay',
        id: pay.id,
        event: 'pay',
        hash: `${amount}|${ymd(date)}`,
        label: `Payment of ${b.number} · ${b.vendorName}`,
      },
      {
        date,
        currency: journalCurrency,
        fxRate: jRate,
        branchId: b.branchId,
        memo: `Payment of ${b.number} · ${b.vendorName}${fx ? ` · FX ${fx > 0 ? 'gain' : 'loss'} ${Math.abs(fx).toFixed(2)}` : ''}`,
        reference: dto.reference ?? b.number,
        lines,
      },
    );
    const j = await this.prisma.finJournal.findFirst({
      where: {
        businessId: actor.rootId,
        sourceType: 'billpay',
        sourceId: pay.id,
        superseded: false,
      },
      orderBy: { sourceRev: 'desc' },
    });
    if (res === 'failed' || !j || j.status !== 'Posted') {
      await this.prisma.finBillPayment.update({
        where: { id: pay.id },
        data: { voidedAt: new Date(), journalId: j?.id ?? null },
      });
      throw new AppException(
        FIN_ERRORS.INVALID,
        `Payment journal failed: ${j?.failureReason ?? 'validation failed'}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const paid = r2(num(b.amountPaid) + amount);
    await this.prisma.$transaction([
      this.prisma.finBillPayment.update({
        where: { id: pay.id },
        data: { journalId: j.id },
      }),
      this.prisma.finBill.update({
        where: { id },
        data: {
          amountPaid: paid,
          status: paid >= num(b.total) ? 'Paid' : 'Partially Paid',
        },
      }),
    ]);
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.payment_recorded',
      'bill',
      id,
      `${amount.toFixed(2)} from ${bank.name} (${j.number})`,
    );
    // A matching bank line may already be waiting — refresh its suggestion.
    const waiting = await this.prisma.finBankLine.findMany({
      where: {
        businessId: actor.rootId,
        bankAccountId: bank.id,
        status: { in: ['New', 'Needs Review', 'Suggested'] },
        amount: -bankTxn,
      },
    });
    for (const w of waiting) await this.banking.suggest(actor.rootId, w, actor);
    return j;
  }

  async voidPayment(actor: FinActor, paymentId: string, reason: string) {
    this.ctx.need(actor, 'approve', 'Voiding a bill payment');
    const p = await this.prisma.finBillPayment.findFirst({
      where: { id: paymentId, businessId: actor.rootId },
      include: { bill: true },
    });
    if (!p || p.voidedAt)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Payment not found',
        HttpStatus.NOT_FOUND,
      );
    if (p.journalId) {
      const matched = await this.prisma.finBankLine.findFirst({
        where: {
          businessId: actor.rootId,
          matchedJournalId: p.journalId,
          status: 'Matched',
        },
      });
      if (matched)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          'This payment is matched to a bank line — undo that match first.',
          HttpStatus.CONFLICT,
        );
      await this.posting.postSystem(
        actor.rootId,
        {
          type: 'billpay',
          id: p.id,
          event: 'pay',
          hash: `void-${Date.now()}`,
          label: `Payment voided — ${reason}`,
        },
        {
          date: new Date(),
          currency: p.bill.currency,
          fxRate: 1,
          branchId: p.bill.branchId,
          memo: '',
          lines: [],
        },
      );
    }
    const paid = r2(num(p.bill.amountPaid) - num(p.amount));
    await this.prisma.$transaction([
      this.prisma.finBillPayment.update({
        where: { id: p.id },
        data: { voidedAt: new Date() },
      }),
      this.prisma.finBill.update({
        where: { id: p.billId },
        data: {
          amountPaid: paid,
          status: paid > 0 ? 'Partially Paid' : 'Posted',
        },
      }),
    ]);
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.payment_voided',
      'bill',
      p.billId,
      reason,
    );
  }

  async attach(
    actor: FinActor,
    id: string,
    file: { key: string; name: string; size: number; type: string },
  ) {
    const b = await this.mustBill(actor.rootId, id);
    const list = Array.isArray(b.attachments) ? b.attachments : [];
    await this.prisma.finBill.update({
      where: { id },
      data: {
        attachments: [
          ...list,
          { ...file, by: actor.name, at: new Date().toISOString() },
        ],
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bill.document_attached',
      'bill',
      id,
      file.name,
    );
  }

  // ── subledger ────────────────────────────────────────────────────────────

  /** Open payables: posted bills less recorded payments, in base currency at the bill rate. */
  async openItems(rootId: string) {
    const bills = await this.prisma.finBill.findMany({
      where: {
        businessId: rootId,
        status: {
          in: ['Posted', 'Partially Paid', 'Approved for Payment', 'On Hold'],
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    return bills.map((b) => ({
      bill: b,
      open: r2(num(b.total) - num(b.amountPaid)),
      openBase: r2((num(b.total) - num(b.amountPaid)) * num(b.fxRate)),
    }));
  }
}
