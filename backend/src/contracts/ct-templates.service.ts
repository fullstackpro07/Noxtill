import { Injectable } from '@nestjs/common';
import {
  CtActor,
  CtContextService,
  Party,
  ctErr,
  notFound,
} from './ct-context.service';
import { CtApprovalsService } from './ct-approvals.service';
import {
  ALL_VARS,
  CT_ERRORS,
  SIGNER_ROLES,
  TPL_POLICIES,
  TPL_TYPES,
} from './ct.constants';

/** Variables Noxtill can fill from a real record; everything else in VARS is typed in by a person. */
export const RECORD_VARS = [
  'business.name',
  'business.address',
  'customer.name',
  'customer.address',
  'customer.email',
  'customer.phone',
  'supplier.name',
  'supplier.address',
  'supplier.phone',
  'counterparty.name',
  'employee.name',
  'contract.number',
  'contract.start_date',
  'contract.end_date',
  'contract.value',
  'contract.notice_days',
  'today',
  'policy.title',
  'policy.version',
];
const RX = /\{\{\s*([^}]*?)\s*\}\}/g;

export interface RenderCtx {
  business: { name: string; address: string | null };
  party?: Party | null;
  number?: string | null;
  start?: Date | null;
  end?: Date | null;
  value?: number | null;
  currency?: string;
  notice?: number | null;
  policy?: { title: string; version: number } | null;
  tz: string;
}

const dmy = (d: Date | null | undefined, tz = 'UTC') =>
  d
    ? d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: d.toISOString().endsWith('T00:00:00.000Z') ? 'UTC' : tz,
      })
    : null;

@Injectable()
export class CtTemplatesService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly approvals: CtApprovalsService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  /** Typed variables only — expressions, functions and unknown names are rejected. */
  checkVars(txt: string) {
    const found = [...txt.matchAll(RX)].map((m) => m[1]);
    const bad = found.filter((v) => !/^[a-z_]+\.[a-z_]+$|^today$/.test(v));
    if (bad.length)
      throw ctErr(
        CT_ERRORS.INVALID,
        `VALIDATION_ERROR — unsafe or malformed expression: ${bad.map((b) => `{{${b}}}`).join(', ')}. Only typed variables like {{customer.name}} are allowed.`,
      );
    const unk = found.filter((v) => !ALL_VARS.includes(v));
    if (unk.length)
      throw ctErr(
        CT_ERRORS.INVALID,
        `VALIDATION_ERROR — unknown variable(s): ${[...new Set(unk)].map((u) => `{{${u}}}`).join(', ')}. Pick from the variable browser.`,
      );
    return [...new Set(found)];
  }

  values(c: RenderCtx): Record<string, string | null> {
    const p = c.party;
    const money =
      c.value == null
        ? null
        : `${c.currency ?? ''} ${c.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`.trim();
    return {
      'business.name': c.business.name,
      'business.address': c.business.address,
      'customer.name': p?.kind === 'customer' ? p.name : null,
      'customer.address': p?.kind === 'customer' ? p.address : null,
      'customer.email': p?.kind === 'customer' ? p.email : null,
      'customer.phone': p?.kind === 'customer' ? p.phone : null,
      'supplier.name': p?.kind === 'supplier' ? p.name : null,
      'supplier.address': p?.kind === 'supplier' ? p.address : null,
      'supplier.phone': p?.kind === 'supplier' ? p.phone : null,
      'counterparty.name': p?.name ?? null,
      'employee.name': p?.kind === 'staff' ? p.name : null,
      'contract.number': c.number ?? null,
      'contract.start_date': dmy(c.start, c.tz),
      'contract.end_date':
        c.end === undefined ? null : c.end ? dmy(c.end, c.tz) : 'open-ended',
      'contract.value': money,
      'contract.notice_days': c.notice == null ? null : String(c.notice),
      today: dmy(new Date(), c.tz),
      'policy.title': c.policy?.title ?? null,
      'policy.version': c.policy ? `v${c.policy.version}` : null,
    };
  }

  /** Fills every variable a real record answers; returns what's still open. */
  render(txt: string, c: RenderCtx) {
    const v = this.values(c);
    const open = new Set<string>();
    const out = txt.replace(RX, (m, k: string) => {
      const x = v[k];
      if (x) return x;
      open.add(k);
      return m;
    });
    return { text: out, open: [...open] };
  }

  async get(a: CtActor, id: string) {
    const t = await this.db.ctTemplate.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    if (!t) throw notFound('Template');
    return t;
  }

  private clean(i: {
    name?: string;
    type?: string;
    content?: string;
    roles?: string[];
    approval?: string;
  }) {
    const name = (i.name ?? '').trim().slice(0, 160);
    if (!name) throw ctErr(CT_ERRORS.INVALID, 'Name required.');
    const content = (i.content ?? '').trim();
    if (!content) throw ctErr(CT_ERRORS.INVALID, 'Content required.');
    return {
      name,
      type: TPL_TYPES.includes(i.type ?? '') ? i.type! : 'Contract',
      content,
      vars: this.checkVars(content),
      roles: (i.roles ?? []).filter((r) =>
        [...SIGNER_ROLES, 'Approver'].includes(r),
      ),
      approval: TPL_POLICIES.includes(i.approval ?? '') ? i.approval! : 'None',
    };
  }

  async save(
    a: CtActor,
    id: string | null,
    i: {
      name?: string;
      type?: string;
      content?: string;
      roles?: string[];
      approval?: string;
    },
  ) {
    this.ctx.need(a, 'manage', 'Editing templates');
    const x = this.clean(i);
    if (!id) {
      const t = await this.db.$transaction(async (tx) => {
        const number = await this.ctx.number(a.rootId, 'tpl', tx);
        return tx.ctTemplate.create({
          data: {
            businessId: a.rootId,
            number,
            name: x.name,
            type: x.type,
            ownerId: a.userId,
            roles: x.roles,
            approval: x.approval,
            status: 'Draft',
            version: 1,
            versions: {
              create: {
                version: 1,
                content: x.content,
                vars: x.vars,
                status: 'Draft',
                byUserId: a.userId,
              },
            },
          },
        });
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Template created',
        'template',
        t.id,
        `${t.number} · ${x.name} · ${x.vars.length} typed variables`,
      );
      return { id: t.id, number: t.number, version: 1 };
    }
    const t = await this.get(a, id);
    if (t.status === 'Archived')
      throw ctErr(
        CT_ERRORS.STATUS,
        'Archived templates can’t be edited — duplicate it instead.',
      );
    const cur = t.versions[t.versions.length - 1];
    const bump = cur.status !== 'Draft';
    const pending = await this.db.ctApproval.findFirst({
      where: {
        businessId: a.rootId,
        entityId: t.id,
        status: { in: ['Pending', 'Escalated'] },
      },
    });
    if (pending && !bump)
      throw ctErr(
        CT_ERRORS.STATUS,
        `v${cur.version} is waiting for approval (${pending.number}) — it can’t change until that’s decided.`,
      );
    const v = bump ? t.version + 1 : t.version;
    await this.db.$transaction(async (tx) => {
      if (bump)
        await tx.ctTemplateVersion.create({
          data: {
            templateId: t.id,
            version: v,
            content: x.content,
            vars: x.vars,
            status: 'Draft',
            byUserId: a.userId,
          },
        });
      else
        await tx.ctTemplateVersion.update({
          where: { id: cur.id },
          data: { content: x.content, vars: x.vars, byUserId: a.userId },
        });
      await tx.ctTemplate.update({
        where: { id: t.id },
        data: {
          name: x.name,
          type: x.type,
          roles: x.roles,
          approval: x.approval,
          version: v,
          status: 'Draft',
        },
      });
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Template edited',
      'template',
      t.id,
      `${t.number}${bump ? ` · new draft v${v} (published v${t.version} kept)` : ` · draft v${v}`}`,
    );
    return { id: t.id, number: t.number, version: v };
  }

  async duplicate(a: CtActor, id: string) {
    const t = await this.get(a, id);
    const cur = t.versions[t.versions.length - 1];
    return this.save(a, null, {
      name: `${t.name} (copy)`,
      type: t.type,
      content: cur.content,
      roles: t.roles as string[],
      approval: t.approval,
    });
  }

  async publish(a: CtActor, id: string) {
    this.ctx.need(a, 'manage', 'Publishing templates');
    const t = await this.get(a, id);
    const cur = t.versions[t.versions.length - 1];
    if (cur.status !== 'Draft')
      throw ctErr(
        CT_ERRORS.STATUS,
        `v${cur.version} is already ${cur.status}.`,
      );
    this.checkVars(cur.content);
    if (t.approval !== 'None') {
      const apr = await this.approvals.start(a, {
        kind: 'Template',
        entityId: t.id,
        type: 'Template publish',
        roles: this.approvals.templateRoles(t.approval),
        reason: `Approval policy: ${t.approval}`,
        changes: `v${cur.version}`,
        label: `${t.number} · ${t.name}`,
        link: '/contracts/templates',
      });
      return { approval: apr.number, status: apr.status };
    }
    await this.db.$transaction(async (tx) => {
      await tx.ctTemplateVersion.updateMany({
        where: { templateId: t.id, status: 'Published' },
        data: { status: 'Superseded' },
      });
      await tx.ctTemplateVersion.update({
        where: { id: cur.id },
        data: { status: 'Published' },
      });
      await tx.ctTemplate.update({
        where: { id: t.id },
        data: { status: 'Published' },
      });
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Template published',
      'template',
      t.id,
      `${t.number} v${cur.version}`,
    );
    return { status: 'Published' };
  }

  async archive(a: CtActor, id: string) {
    this.ctx.need(a, 'manage', 'Archiving templates');
    const t = await this.get(a, id);
    await this.db.ctTemplate.update({
      where: { id: t.id },
      data: { status: 'Archived' },
    });
    await this.approvals.cancelFor(a, t.id, 'template archived');
    await this.ctx.audit(
      a.rootId,
      a,
      'Template archived',
      'template',
      t.id,
      `${t.number} · generated documents unaffected`,
    );
    return { ok: true };
  }

  /** The latest published version — what a new contract is generated from. */
  published(t: {
    versions: { status: string; version: number; content: string }[];
  }) {
    return (
      [...t.versions].reverse().find((v) => v.status === 'Published') ?? null
    );
  }
}
