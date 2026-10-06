import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FsActor,
  FsContextService,
  fsErr,
  notFound,
  num,
} from './fs-context.service';
import { FsDataService } from './fs-data.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FS_ERRORS } from './fs.constants';

/**
 * Parts on field jobs. Listing a part never moves stock; a reservation is a hold Field Service
 * keeps (Inventory has no reservation ledger) and counts against availability for other jobs.
 * Issuing writes a real Inventory movement (kind field_service, qty < 0) and decrements stock in
 * one transaction; returns reverse it. Finance posts the movement Dr COGS / Cr Inventory.
 */
@Injectable()
export class FsPartsService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
    private readonly wos: FsWorkOrdersService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private async ctxOf(a: FsActor, woId: string, partId?: string) {
    const d = await this.wos.load(a);
    const w = this.wos.must(d, woId);
    const p = partId ? w.parts.find((x) => x.id === partId) : undefined;
    if (partId && !p) throw notFound('Part line');
    return { d, w, p: p! };
  }

  async add(a: FsActor, woId: string, b: { productId: string; qty: number }) {
    if (!a.parts && !a.execute && !a.workorder)
      this.ctx.need(a, 'parts', 'Adding parts');
    const { d, w } = await this.ctxOf(a, woId);
    if (['Closed', 'Cancelled'].includes(w.status))
      throw fsErr(
        FS_ERRORS.STATUS,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    const q = Math.round(Number(b.qty));
    if (!(q >= 1))
      throw fsErr(FS_ERRORS.INVALID, 'Quantity must be at least 1.');
    const pr = await this.db.product.findFirst({
      where: {
        id: b.productId,
        businessId: { in: d.group.map((g) => g.id) },
        kind: 'product',
      },
    });
    if (!pr) throw fsErr(FS_ERRORS.INVALID, 'Pick an Inventory product.');
    const line = w.parts.find((x) => x.productId === pr.id && x.issued === 0);
    if (line)
      await this.db.fsWoPart.update({
        where: { id: line.id },
        data: { required: line.required + q },
      });
    else
      await this.db.fsWoPart.create({
        data: { woId: w.id, productId: pr.id, required: q },
      });
    await this.ctx.event(a.rootId, w.id, `Part required: ${pr.name} ×${q}`, a);
    await this.ctx.audit(
      a.rootId,
      a,
      'Part requirement added',
      'wo',
      w.id,
      `${w.number} · ${pr.name} ×${q} · event field.parts.required`,
    );
    return { ok: true };
  }

  async reserve(a: FsActor, woId: string, partId: string) {
    this.ctx.need(a, 'parts', 'Reserving parts');
    const { d, w, p } = await this.ctxOf(a, woId, partId);
    const need = p.required - p.reserved;
    if (need <= 0) throw fsErr(FS_ERRORS.INVALID, 'Already reserved.');
    const av = this.data.available(d, p.productId, p.id);
    if (av == null)
      throw fsErr(
        FS_ERRORS.PART,
        'INTEGRATION_UNAVAILABLE — the Inventory product is gone. Nothing reserved.',
        HttpStatus.CONFLICT,
      );
    if (av < p.required)
      throw fsErr(
        FS_ERRORS.PART,
        `PART_NOT_AVAILABLE — ${av} available (stock minus holds on other jobs), ${p.required} needed. Nothing reserved.`,
        HttpStatus.CONFLICT,
      );
    await this.db.fsWoPart.update({
      where: { id: p.id },
      data: { reserved: p.required },
    });
    await this.ctx.event(
      a.rootId,
      w.id,
      `Part reserved: ${this.data.partName(d, p.productId)} ×${p.required}`,
      a,
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Part reserved',
      'wo',
      w.id,
      `${w.number} · ${this.data.partName(d, p.productId)} ×${p.required}`,
    );
    return {
      ok: true,
      msg: `Reserved ${this.data.partName(d, p.productId)} ×${p.required}.`,
    };
  }

  async issue(a: FsActor, woId: string, partId: string) {
    this.ctx.need(a, 'parts', 'Issuing parts');
    const { d, w, p } = await this.ctxOf(a, woId, partId);
    if (['Closed', 'Cancelled'].includes(w.status))
      throw fsErr(
        FS_ERRORS.STATUS,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    const want = p.required - (p.issued - p.returned);
    if (want <= 0) throw fsErr(FS_ERRORS.INVALID, 'Already issued.');
    const held = this.data.heldElsewhere(d, p.productId, p.id);
    const res = await this.db.$transaction(async (tx) => {
      const pr = await tx.product.findUniqueOrThrow({
        where: { id: p.productId },
      });
      if (pr.stockQty - held < want)
        return {
          ok: false as const,
          have: Math.max(0, pr.stockQty - held),
          name: pr.name,
        };
      const r = await tx.product.updateMany({
        where: { id: pr.id, stockQty: { gte: want } },
        data: { stockQty: { decrement: want } },
      });
      if (!r.count)
        return { ok: false as const, have: pr.stockQty, name: pr.name };
      const mv = await tx.stockMovement.create({
        data: {
          businessId: pr.businessId,
          productId: pr.id,
          kind: 'field_service',
          qty: -want,
          unitCost: pr.costPrice,
          reason: `Field service issue · ${w.number}`,
        },
      });
      await tx.fsPartMove.create({
        data: {
          partId: p.id,
          stockMovementId: mv.id,
          qty: -want,
          unitCost: pr.costPrice,
          byUserId: a.userId,
        },
      });
      await tx.fsWoPart.update({
        where: { id: p.id },
        data: {
          issued: { increment: want },
          reserved: Math.max(p.reserved, p.issued + want),
        },
      });
      await this.ctx.event(
        a.rootId,
        w.id,
        `Part issued by Inventory: ${pr.name} ×${want} (SM-${mv.id.slice(0, 8)})`,
        a,
        tx,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Part issued',
        'wo',
        w.id,
        `${w.number} · ${pr.name} ×${want} · SM-${mv.id.slice(0, 8)}`,
        { tx },
      );
      return { ok: true as const, name: pr.name, mv: mv.id };
    });
    if (!res.ok)
      throw fsErr(
        FS_ERRORS.PART,
        `PART_NOT_AVAILABLE — ${res.name}: ${res.have} available, ${want} needed. No stock moved.`,
        HttpStatus.CONFLICT,
      );
    return {
      ok: true,
      msg: `Inventory confirmed issue of ${res.name} ×${want} (SM-${res.mv.slice(0, 8)}).`,
    };
  }

  async use(
    a: FsActor,
    woId: string,
    partId: string,
    b: { qty: number; reason?: string; serial?: string; key?: string },
    viaApproval = false,
  ) {
    return this.ctx.once(a.rootId, b.key, async () => {
      if (!a.execute && !a.parts)
        this.ctx.need(a, 'execute', 'Recording part use');
      const { d, w, p } = await this.ctxOf(a, woId, partId);
      const left = p.issued - p.used - p.returned;
      const q = Math.round(Number(b.qty));
      if (!(q > 0) || q > left)
        throw fsErr(
          FS_ERRORS.INVALID,
          `Quantity must be 1–${left} (issued minus used/returned).`,
        );
      const unit = num(
        p.moves.find((m) => m.qty < 0)?.unitCost ??
          d.products.get(p.productId)?.cost ??
          0,
      );
      if (
        !viaApproval &&
        unit * q > d.cfg.parts.highValue &&
        d.cfg.approvals.highValueParts &&
        !a.approve
      ) {
        const r = await this.wos.approvalReq(
          a,
          'High-value part use',
          'wo',
          w.id,
          `${w.number} · ${this.data.partName(d, p.productId)} ×${q} (${d.fmt.money(unit * q)})`,
          { woId: w.id, partId: p.id, qty: q, reason: b.reason ?? '' },
        );
        return { ok: false, approval: true, msg: r.msg };
      }
      await this.db.fsWoPart.update({
        where: { id: p.id },
        data: { used: { increment: q } },
      });
      await this.ctx.event(
        a.rootId,
        w.id,
        `Part used: ${this.data.partName(d, p.productId)} ×${q}${b.serial ? ` · serial ${b.serial}` : ''}${b.reason ? ` — ${b.reason}` : ''}`,
        a,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Part used',
        'wo',
        w.id,
        `${w.number} · ${this.data.partName(d, p.productId)} ×${q} · event field.parts.used`,
      );
      return {
        ok: true,
        msg: `Recorded use of ${this.data.partName(d, p.productId)} ×${q} (stock left Inventory when it was issued).`,
      };
    });
  }

  async giveBack(
    a: FsActor,
    woId: string,
    partId: string,
    b: { qty: number; reason?: string; key?: string },
  ) {
    return this.ctx.once(a.rootId, b.key, async () => {
      if (!a.execute && !a.parts)
        this.ctx.need(a, 'execute', 'Returning parts');
      const { d, w, p } = await this.ctxOf(a, woId, partId);
      const left = p.issued - p.used - p.returned;
      const q = Math.round(Number(b.qty));
      if (!(q > 0) || q > left)
        throw fsErr(
          FS_ERRORS.INVALID,
          `Quantity must be 1–${left} (issued minus used/returned).`,
        );
      const name = this.data.partName(d, p.productId);
      await this.db.$transaction(async (tx) => {
        const pr = await tx.product.findUniqueOrThrow({
          where: { id: p.productId },
        });
        const unit = p.moves.find((m) => m.qty < 0)?.unitCost ?? pr.costPrice;
        await tx.product.update({
          where: { id: pr.id },
          data: { stockQty: { increment: q } },
        });
        const mv = await tx.stockMovement.create({
          data: {
            businessId: pr.businessId,
            productId: pr.id,
            kind: 'field_service',
            qty: q,
            unitCost: unit,
            reason: `Field service return · ${w.number}${b.reason ? ` · ${b.reason}` : ''}`,
          },
        });
        await tx.fsPartMove.create({
          data: {
            partId: p.id,
            stockMovementId: mv.id,
            qty: q,
            unitCost: unit,
            byUserId: a.userId,
          },
        });
        await tx.fsWoPart.update({
          where: { id: p.id },
          data: { returned: { increment: q } },
        });
        await this.ctx.event(
          a.rootId,
          w.id,
          `Part returned to stock: ${name} ×${q} (SM-${mv.id.slice(0, 8)})`,
          a,
          tx,
        );
        await this.ctx.audit(
          a.rootId,
          a,
          'Part returned',
          'wo',
          w.id,
          `${w.number} · ${name} ×${q} · event field.parts.returned`,
          { tx },
        );
      });
      return { ok: true, msg: `Inventory confirmed return of ${name} ×${q}.` };
    });
  }

  /** Purchase order (draft) in Inventory for a shortage on this job. */
  async procure(a: FsActor, woId: string, partId: string, supplierId: string) {
    this.ctx.need(a, 'parts', 'Requesting purchases');
    const { d, w, p } = await this.ctxOf(a, woId, partId);
    if (p.purchaseOrderId)
      throw fsErr(
        FS_ERRORS.DUPLICATE,
        'A purchase order is already open for this part line.',
        HttpStatus.CONFLICT,
      );
    const pr = await this.db.product.findUnique({ where: { id: p.productId } });
    if (!pr) throw notFound('Product');
    const sup = await this.db.supplier.findFirst({
      where: { id: supplierId, businessId: { in: d.group.map((g) => g.id) } },
    });
    if (!sup)
      throw fsErr(
        FS_ERRORS.INVALID,
        'Pick a supplier (Inventory › Suppliers).',
      );
    const av = this.data.available(d, p.productId, p.id) ?? 0;
    const qty = Math.max(1, p.required - p.issued - av);
    const po = await this.db.purchaseOrder.create({
      data: {
        businessId: pr.businessId,
        supplierId: sup.id,
        status: 'draft',
        note: `Field service ${w.number} — ${pr.name} shortage`,
        createdByUserId: a.userId,
        items: {
          create: [
            { productId: pr.id, qtyOrdered: qty, unitCost: pr.costPrice },
          ],
        },
      },
    });
    await this.db.fsWoPart.update({
      where: { id: p.id },
      data: { purchaseOrderId: po.id },
    });
    await this.ctx.event(
      a.rootId,
      w.id,
      `Purchase order drafted in Inventory: ${pr.name} ×${qty} from ${sup.name}`,
      a,
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Procurement requested',
      'wo',
      w.id,
      `${w.number} · PO ${po.id.slice(0, 8)} · ${pr.name} ×${qty} · ${sup.name}`,
    );
    return {
      ok: true,
      msg: `Draft purchase order for ${pr.name} ×${qty} created in Inventory (${sup.name}).`,
    };
  }
}
