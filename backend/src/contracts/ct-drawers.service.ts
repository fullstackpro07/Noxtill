import { Injectable } from '@nestjs/common';
import { btn } from '../payments/pay-vm';
import { CtActor, CtContextService, notFound } from './ct-context.service';
import { CtDataService, CtScope, Data, Step } from './ct-data.service';
import { CtViewsService, chipOf } from './ct-views.service';
import { CtTemplatesService, RECORD_VARS } from './ct-templates.service';
import { VARS } from './ct.constants';

type KV = { k: string; v: string };
const KV = (k: string, v: string | number | null | undefined): KV => ({
  k,
  v: v == null || v === '' ? '—' : String(v),
});
const B = (st: string) => {
  const c = chipOf(st);
  return { t: c.t, bg: c.bg, fg: c.fg };
};
const none = (a = 'None') => [{ a, c: '', b: '', d: '' }];

/** Line diff (LCS) of two extracted texts — capped so a huge document can't stall the request. */
export function lineDiff(a: string, b: string, cap = 1500) {
  const x = a.split(/\r?\n/).map((l) => l.trimEnd());
  const y = b.split(/\r?\n/).map((l) => l.trimEnd());
  if (x.length > cap || y.length > cap) return null;
  const m = x.length;
  const n = y.length;
  const L: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      L[i][j] =
        x[i] === y[j]
          ? L[i + 1][j + 1] + 1
          : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) {
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push(`− ${x[i++]}`);
    else out.push(`+ ${y[j++]}`);
  }
  while (i < m) out.push(`− ${x[i++]}`);
  while (j < n) out.push(`+ ${y[j++]}`);
  return out.filter((l) => l.length > 2);
}

@Injectable()
export class CtDrawersService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly data: CtDataService,
    private readonly views: CtViewsService,
    private readonly templates: CtTemplatesService,
  ) {}

  async drawer(a: CtActor, s: CtScope, kind: string, id: string) {
    const d = await this.data.load(a, s);
    const base = {
      badges: [] as unknown[],
      sections: [] as unknown[],
      hasActs: false,
      acts: [] as unknown[],
    };
    const audit = async (ids: string[]) => {
      const rows = await this.ctx.db.ctAudit.findMany({
        where: { businessId: a.rootId, entityId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      return rows.length
        ? rows.map((x) => ({
            a: x.action,
            c: `${x.actorName} · ${this.views.ago(d, x.createdAt)}`,
            b: x.correlation,
            d: x.detail.slice(0, 160),
          }))
        : none('No actions yet');
    };

    if (kind === 'doc') {
      const x = this.data.doc(d, id);
      if (!x || !this.data.docVisible(d, x))
        return {
          ...base,
          kicker: 'Document',
          title: 'Not available',
          sections: [
            {
              h: 'Access',
              text: 'PERMISSION_DENIED — this document is restricted for your role. Its contents and metadata were not sent to this browser.',
            },
          ],
        };
      const v = this.data.cur(x);
      const sigs = d.sigs.filter((y) => y.docId === x.id);
      const aps = d.approvals.filter((y) => y.entityId === x.id);
      const shares = ((x.shares as string[]) ?? []).map((u) =>
        this.data.name(d, u),
      );
      return {
        ...base,
        kicker: `${x.type} · ${x.number}`,
        title: x.title,
        badges: [
          B(x.status),
          B(x.sensitivity),
          { t: `v${v?.version ?? 1}`, bg: '#F2F4F7', fg: '#344054' },
          ...(x.legalHold ? [B('Legal Hold')] : []),
          ...(x.archivedAt ? [B('Archived')] : []),
        ],
        sections: [
          ...(x.legalHold
            ? [
                {
                  h: 'Legal hold',
                  warn: `${x.legalHold} — delete, archive, move and new versions are blocked.`,
                },
              ]
            : []),
          ...(x.processing ? [{ h: 'Processing', warn: x.processing }] : []),
          {
            h: 'Preview',
            text: v?.text
              ? `${v.text.slice(0, 1200)}${v.text.length > 1200 ? '\n…' : ''}`
              : v?.storageKey
                ? 'No text preview for this file type — download to view (5-minute signed link).'
                : 'Metadata-only record — no file uploaded yet.',
          },
          {
            h: 'Metadata',
            kv: [
              KV('Owner', this.data.name(d, x.ownerId)),
              KV('Folder', x.folder),
              KV('Tags', ((x.tags as string[]) ?? []).join(', ')),
              KV(
                'Expiry',
                x.expiresOn ? this.data.dday(d, x.expiresOn) : 'None',
              ),
              KV('Retention', x.retention),
              KV('Branch', this.data.branchName(d, x.branchId)),
              KV(
                'File',
                v?.fileName
                  ? `${v.fileName} · ${Math.max(1, Math.round(v.size / 1024))} KB`
                  : 'None',
              ),
              KV('SHA-256', v?.sha256),
            ],
          },
          {
            h: 'Linked records',
            items: x.linkModule
              ? [
                  {
                    a: x.linkModule,
                    c: this.data.linkName(d, x.linkModule, x.linkId),
                    b: 'Canonical link',
                    d: '',
                  },
                ]
              : none('Not linked'),
          },
          {
            h: 'Versions (immutable once approved/signed)',
            items: [...x.versions].reverse().map((y) => ({
              a: `v${y.version} · ${y.note}`,
              c: `${this.data.name(d, y.byUserId)} · ${this.data.dday(d, y.createdAt)}${y.sha256 ? ` · ${y.sha256.slice(0, 12)}…` : ''}`,
              b: y.state,
              d: y.immutable ? 'Locked' : 'Editable',
            })),
          },
          {
            h: 'Approvals',
            items: aps.length
              ? aps.map((y) => ({
                  a: `${y.number} · ${y.type}`,
                  c: (y.steps as unknown as Step[])
                    .map((z) => `${z.role} ${z.status}`)
                    .join(' → '),
                  b: y.status,
                  d: '',
                }))
              : none(),
          },
          {
            h: 'Signatures',
            items: sigs.length
              ? sigs.map((y) => ({
                  a: `${y.number} · v${y.docVersion}`,
                  c: y.signers.map((z) => `${z.name} ${z.status}`).join(', '),
                  b: y.status,
                  d: '',
                }))
              : none(),
          },
          {
            h: 'Shared internally',
            items: shares.length
              ? shares.map((n) => ({ a: n, c: 'Internal', b: '', d: '' }))
              : [
                  {
                    a: 'Not shared',
                    c: 'Internal sharing only — nothing is sent outside Noxtill from here',
                    b: '',
                    d: '',
                  },
                ],
          },
          { h: 'Audit', items: await audit([x.id]) },
        ],
        hasActs: true,
        acts: this.views
          .docActs(d, x)
          .filter((y) => y !== 'Open')
          .slice(0, 6)
          .map((y, i) =>
            btn(
              `doc:${y}`,
              y,
              i === 0 ? 'primary' : y === 'Delete' ? 'danger' : 'ghost',
            ),
          ),
        ref: {
          id: x.id,
          number: x.number,
          title: x.title,
          version: v?.version ?? 1,
          immutable: !!v?.immutable,
          hold: x.legalHold,
          sensitivity: x.sensitivity,
          shares: x.shares,
          ret: x.retention,
          contract: d.contracts.find((c) => c.docId === x.id)?.number ?? null,
        },
      };
    }

    if (kind === 'cmpv') {
      const x = this.data.doc(d, id);
      if (!x || !this.data.docVisible(d, x)) throw notFound('Document');
      if (x.versions.length < 2)
        return {
          ...base,
          kicker: 'Compare versions',
          title: x.title,
          sections: [
            {
              h: 'Only one version',
              text: `${x.number} has a single version.`,
            },
          ],
        };
      const p = x.versions[x.versions.length - 2];
      const q = x.versions[x.versions.length - 1];
      const diff =
        p.text != null && q.text != null ? lineDiff(p.text, q.text) : null;
      return {
        ...base,
        kicker: 'Compare versions',
        title: `${x.title} · v${p.version} ↔ v${q.version}`,
        sections: [
          {
            h: 'Metadata',
            items: [
              ['Change note', p.note, q.note],
              [
                'Uploaded by',
                this.data.name(d, p.byUserId),
                this.data.name(d, q.byUserId),
              ],
              [
                'Date',
                this.data.dday(d, p.createdAt),
                this.data.dday(d, q.createdAt),
              ],
              ['State', p.state, q.state],
              [
                'SHA-256',
                p.sha256 ? `${p.sha256.slice(0, 12)}…` : '—',
                q.sha256 ? `${q.sha256.slice(0, 12)}…` : '—',
              ],
              [
                'Size',
                `${Math.round(p.size / 1024)} KB`,
                `${Math.round(q.size / 1024)} KB`,
              ],
            ].map(([k, u, w]) => ({
              a: k,
              c: `v${p.version}: ${u}`,
              b: u === w ? 'Same' : 'Changed',
              d: `v${q.version}: ${w}`,
            })),
          },
          {
            h: 'Extracted text differences',
            text:
              p.text == null || q.text == null
                ? 'Not available — one of the versions has no extractable text (scanned PDF, image or spreadsheet).'
                : diff == null
                  ? 'Too long to compare line by line here — download both versions.'
                  : diff.length
                    ? diff.slice(0, 300).join('\n') +
                      (diff.length > 300
                        ? `\n… ${diff.length - 300} more changed lines`
                        : '')
                    : p.sha256 === q.sha256
                      ? 'Identical files (same SHA-256).'
                      : 'No text differences — the files differ only in formatting or layout.',
          },
          {
            h: 'Limits',
            text: 'Line comparison of extracted text. It isn’t a pixel-perfect legal comparison — review the original files.',
          },
        ],
      };
    }

    if (kind === 'sig' || kind === 'evidence') {
      const x = d.sigs.find((y) => y.id === id || y.number === id);
      if (!x) throw notFound('Signature request');
      const doc = d.docs.find((y) => y.id === x.docId);
      const ct = d.contracts.find((c) => c.id === x.contractId);
      if (ct && !this.data.ctVisible(d, ct))
        return {
          ...base,
          kicker: 'Signature request',
          title: 'Not available',
          sections: [
            {
              h: 'Access',
              text: 'PERMISSION_DENIED — this request belongs to a restricted contract.',
            },
          ],
        };
      const ev = await this.ctx.db.ctSignEvent.findMany({
        where: { requestId: x.id },
        orderBy: { createdAt: 'desc' },
        take: 60,
      });
      if (kind === 'evidence') {
        if (!a.evidence)
          return {
            ...base,
            kicker: 'Evidence pack',
            title: 'Restricted',
            sections: [
              {
                h: 'Access',
                text: 'PERMISSION_DENIED — contracts.evidence required.',
              },
            ],
          };
        const v = doc?.versions.find((y) => y.version === x.docVersion);
        return {
          ...base,
          kicker: `Evidence pack · ${x.number}`,
          title: doc?.title ?? 'Document',
          sections: [
            {
              h: 'Signed artifact',
              kv: [
                KV('Document', `${doc?.number} v${x.docVersion}`),
                KV('SHA-256 sent', x.docSha256),
                KV('SHA-256 stored', v?.sha256),
                KV(
                  'Integrity',
                  x.docSha256 && v?.sha256 === x.docSha256
                    ? 'Match — the signed bytes are unchanged'
                    : 'MISMATCH — investigate',
                ),
                KV(
                  'Completed',
                  x.completedAt?.toISOString().replace('T', ' ').slice(0, 19),
                ),
                KV('Provider', 'Noxtill eSign (built in)'),
              ],
            },
            {
              h: 'Signers',
              items: x.signers.map((y) => ({
                a: `${y.name} · ${y.role}`,
                c: `${y.auth}${y.auth === 'Email + OTP' && y.status === 'Signed' ? ' (code verified)' : ''} · ${y.email} · ${y.sigType ?? '—'} signature`,
                b: y.status,
                d: [
                  y.viewedAt &&
                    `viewed ${y.viewedAt.toISOString().slice(0, 16).replace('T', ' ')}`,
                  y.signedAt &&
                    `signed ${y.signedAt.toISOString().slice(0, 16).replace('T', ' ')}`,
                  y.ip && `IP ${y.ip}`,
                  y.userAgent && y.userAgent.slice(0, 60),
                ]
                  .filter(Boolean)
                  .join(' · '),
              })),
            },
            {
              h: 'Event log',
              items: ev.length
                ? ev.map((e) => ({
                    a: e.type,
                    c: e.createdAt.toISOString().slice(0, 19).replace('T', ' '),
                    b: e.ip ?? '',
                    d: e.detail,
                  }))
                : none(),
            },
            {
              h: 'Excluded',
              text: 'One-time codes and signing tokens are never stored in readable form, so they can’t appear here.',
            },
          ],
          hasActs: true,
          acts: [btn('ev-dl', 'Download evidence pack', 'primary')],
        };
      }
      return {
        ...base,
        kicker: `Signature request · ${x.number}`,
        title: `${doc?.title ?? 'Document'} · v${x.docVersion}`,
        badges: [B(x.status), { t: x.ordering, bg: '#F2F4F7', fg: '#344054' }],
        sections: [
          ...(x.note ? [{ h: 'Note', warn: x.note }] : []),
          ...(x.signers.some((y) => y.status === 'Delivery Failed')
            ? [
                {
                  h: 'Delivery',
                  warn: 'An email couldn’t be delivered. Resend after checking the address, or use “Signing link” to hand the link over yourself.',
                },
              ]
            : []),
          {
            h: 'Request',
            kv: [
              KV(
                'Document / version',
                `${doc?.number} v${x.docVersion} (locked while out for signature)`,
              ),
              KV('Contract', ct?.number),
              KV('Sender', this.data.name(d, x.senderId)),
              KV('Deadline', this.data.dday(d, x.deadline)),
              KV('Fields', ((x.fields as string[]) ?? []).join(', ')),
              KV('Reminders', x.reminders),
              KV(
                'SHA-256',
                x.docSha256 ? `${x.docSha256.slice(0, 20)}…` : null,
              ),
            ],
          },
          {
            h: 'Signers',
            items: x.signers.map((y) => ({
              a: `${y.name} · ${y.role}`,
              c: `${y.email} · ${y.auth} · order ${x.ordering === 'Parallel' ? 'parallel' : y.seq}`,
              b: y.status,
              d: [
                y.sentAt && `sent ${this.data.dday(d, y.sentAt)}`,
                y.viewedAt && `viewed ${this.data.dday(d, y.viewedAt)}`,
                y.signedAt && `signed ${this.data.dday(d, y.signedAt)}`,
                y.declineReason && `declined: ${y.declineReason}`,
              ]
                .filter(Boolean)
                .join(' · '),
            })),
          },
          {
            h: 'Timeline',
            items: ev.length
              ? ev.map((e) => ({
                  a: e.type,
                  c: this.views.ago(d, e.createdAt),
                  b: '',
                  d: e.detail,
                }))
              : none('No events yet'),
          },
        ],
        hasActs: true,
        acts: this.views
          .sigActs(d, x)
          .filter((y) => y !== 'Open')
          .slice(0, 5)
          .map((y, i) =>
            btn(
              `sig:${y}`,
              y,
              i === 0 ? 'primary' : y === 'Void' ? 'danger' : 'ghost',
            ),
          ),
        ref: {
          id: x.id,
          number: x.number,
          contract: ct?.number ?? null,
          signers: x.signers
            .filter((y) => !['Signed', 'Declined'].includes(y.status))
            .map((y) => ({ id: y.id, name: y.name })),
          pending: x.signers
            .filter((y) => y.status !== 'Signed')
            .map((y) => y.name),
          doc: doc?.title ?? '',
        },
      };
    }

    if (kind === 'apr') {
      const x = d.approvals.find((y) => y.id === id || y.number === id);
      if (!x) throw notFound('Approval');
      const steps = x.steps as unknown as Step[];
      const cs = steps.find((y) => ['Pending', 'Escalated'].includes(y.status));
      const ct =
        x.kind === 'Contract'
          ? d.contracts.find((c) => c.id === x.entityId)
          : x.kind === 'Amendment'
            ? d.contracts.find((c) => c.amends.some((m) => m.id === x.entityId))
            : undefined;
      if (ct && !this.data.ctVisible(d, ct))
        return {
          ...base,
          kicker: 'Approval',
          title: 'Not available',
          sections: [
            { h: 'Access', text: 'PERMISSION_DENIED — restricted contract.' },
          ],
        };
      const ent =
        x.kind === 'Template'
          ? d.templates.find((t) => t.id === x.entityId)?.number
          : x.kind === 'Document'
            ? d.docs.find((y) => y.id === x.entityId)?.number
            : ct?.number;
      const comments =
        (x.comments as { t: string; by: string; at: string; dec: string }[]) ??
        [];
      const canDecide =
        !!cs && a.approve && (cs.userId === a.userId || a.owner);
      return {
        ...base,
        kicker: `Approval · ${x.number}`,
        title: `${x.type} · ${ent ?? '—'}`,
        badges: [B(x.status)],
        sections: [
          { h: 'Why approval is needed', text: x.reason },
          {
            h: 'Record',
            kv: [
              KV('Record', `${x.kind} ${ent ?? ''}`),
              KV('Version / change', x.changes),
              KV(
                'Requested by',
                `${this.data.name(d, x.requestedById)} · ${this.data.dday(d, x.createdAt)}`,
              ),
              KV(
                'Due',
                `${this.data.dday(d, x.dueOn)} · ${this.data.rel(this.data.off(d, x.dueOn))}`,
              ),
              KV(
                'Current step',
                cs
                  ? `${cs.role} · ${this.data.name(d, cs.userId)}`
                  : 'Complete',
              ),
              KV('Linked value', ct ? this.data.val(d, ct.value) : '—'),
            ],
          },
          {
            h: 'Steps',
            items: steps.map((y, i) => ({
              a: `${i + 1}. ${y.role}`,
              c: this.data.name(d, y.userId),
              b: y.status,
              d: [
                y.at ? this.data.dday(d, new Date(y.at)) : '',
                y.comment ?? '',
              ]
                .filter(Boolean)
                .join(' · '),
            })),
          },
          {
            h: 'Comments',
            items: comments.length
              ? comments.map((y) => ({
                  a: y.t,
                  c: `${y.by} · ${y.at.slice(0, 16).replace('T', ' ')}`,
                  b: y.dec,
                  d: '',
                }))
              : none(),
          },
          {
            h: 'Four-eyes',
            text: d.cfg.approvals.fourEyes
              ? `${this.data.name(d, x.requestedById)} requested this, so they can’t approve it.`
              : 'Four-eyes control is off.',
          },
        ],
        hasActs: true,
        acts: [
          ...(canDecide ? [btn('apr:decide', 'Decide', 'primary')] : []),
          btn('apr:open', `Open ${x.kind.toLowerCase()}`),
        ],
        ref: {
          id: x.id,
          number: x.number,
          kind: x.kind,
          ent: ent ?? null,
          entityId: x.entityId,
          contract: ct?.number ?? null,
          type: x.type,
          changes: x.changes,
          reason: x.reason,
          step: cs?.role ?? null,
          value: ct ? this.data.val(d, ct.value) : null,
          requester: x.requestedById,
        },
      };
    }

    if (kind === 'exp') {
      const e = this.data.expiries(d).find((y) => y.id === id);
      if (!e) throw notFound('Expiry item');
      const c =
        e.kind === 'Contract'
          ? d.contracts.find((y) => y.id === e.refId)
          : undefined;
      const st = e.kind === 'Contract' ? null : d.states.get(e.id);
      const clause = c?.terms.find((t) => /renew|notice/i.test(t.term));
      const dd = (n: number | null) =>
        n == null ? '—' : this.data.dday(d, this.data.dateIn(d, n));
      return {
        ...base,
        kicker: `Renewal · ${e.kind}`,
        title: e.title,
        badges: [B(e.st)],
        sections: [
          {
            h: 'Dates',
            kv: [
              KV('Expiry', `${dd(e.exp)} · ${this.data.rel(e.exp)}`),
              KV(
                'Notice deadline',
                `${dd(e.notice)}${e.notice != null && e.notice < 0 && e.exp >= 0 ? ' · PASSED' : ''}`,
              ),
              KV('Auto-renew', e.auto ? 'Yes' : 'No'),
              KV('Owner', e.owner),
              KV('Replacement', e.repl ? 'Required' : 'Not required'),
              KV(
                'Renewal clause',
                c
                  ? clause
                    ? `${clause.source} · ${clause.value}`
                    : 'Not captured'
                  : '—',
              ),
            ],
          },
          {
            h: 'Related renewals',
            text: c
              ? d.contracts
                  .filter((y) => y.renewalOf === c.id || y.id === c.renewalOf)
                  .map((y) => `${y.number} (${y.status})`)
                  .join(', ') || 'None on record'
              : '—',
          },
          {
            h: 'Decision log',
            text: (c ? c.renewNote : st?.note) || 'No decision yet',
          },
          {
            h: 'Next action',
            text:
              e.st === 'Expired'
                ? 'Expired — renew with a new contract or archive.'
                : e.notice != null && e.notice < 0
                  ? 'Notice window has passed — decide now; auto-renew may already be binding.'
                  : `Review terms and decide before ${dd(e.notice)}.`,
          },
        ],
        hasActs: a.manage,
        acts: this.views
          .expActs(d, e)
          .filter((y) => y !== 'Open renewal')
          .slice(0, 6)
          .map((y, i) => btn(`exp:${y}`, y, i === 0 ? 'primary' : 'ghost')),
        ref: {
          id: e.id,
          kind: e.kind,
          ref: e.ref,
          refId: e.refId,
          title: e.title,
          type: e.type,
          owner: e.owner,
          notice: e.notice == null ? null : dd(e.notice),
          noticeDays: e.notice,
          exp: dd(e.exp),
          expDays: e.exp,
          endIso: c?.endOn?.toISOString().slice(0, 10) ?? null,
        },
      };
    }

    if (kind === 'cmp' || kind === 'cmpev') {
      const x = d.comp.find((y) => y.id === id || y.number === id);
      if (!x) throw notFound('Compliance record');
      const doc = this.data.doc(d, x.docId);
      const v = doc ? this.data.cur(doc) : null;
      const aud = this.data.audience(d, x);
      const t = this.data.ackTotals(d, x);
      const ackRows = aud.map((m) => {
        const k = x.acks.find(
          (y) => y.userId === m.id && y.version === x.version,
        );
        return {
          a: m.name,
          c: `v${x.version}`,
          b: k?.status ?? 'Not requested',
          d: k?.ackedAt
            ? this.data.dday(d, k.ackedAt)
            : k
              ? `requested ${this.data.dday(d, k.requestedAt)}`
              : '',
        };
      });
      if (kind === 'cmpev') {
        if (!a.evidence)
          return {
            ...base,
            kicker: 'Evidence pack',
            title: 'Restricted',
            sections: [
              {
                h: 'Access',
                text: 'PERMISSION_DENIED — contracts.evidence required.',
              },
            ],
          };
        return {
          ...base,
          kicker: 'Evidence pack',
          title: x.title,
          sections: [
            {
              h: 'Contents',
              kv: [
                KV(
                  'Document version',
                  doc ? `${doc.number} v${v?.version}` : 'Missing',
                ),
                KV('SHA-256', v?.sha256),
                KV('Effective', this.data.dday(d, x.effectiveOn)),
                KV('Audience', this.views.audLabel(d, x.audience)),
                KV('Expiry', this.data.dday(d, x.expiresOn)),
              ],
            },
            {
              h: 'Acknowledgement log',
              items:
                x.mandatoryAck && ackRows.length
                  ? ackRows
                  : none('No acknowledgements required'),
            },
          ],
          hasActs: true,
          acts: [btn('ev-dl', 'Download evidence pack', 'primary')],
        };
      }
      const st = this.data.cmpSt(d, x);
      return {
        ...base,
        kicker: `Compliance document · ${x.type}`,
        title: x.title,
        badges: [B(st)],
        sections: [
          {
            h: 'Document',
            kv: [
              KV(
                'Evidence file',
                doc ? `${doc.number} · ${v?.fileName ?? 'no file'}` : 'Missing',
              ),
              KV('Version', x.version ? `v${x.version}` : '—'),
              KV('Jurisdiction', x.jurisdiction),
              KV('Owner', this.data.name(d, x.ownerId)),
              KV('Effective', this.data.dday(d, x.effectiveOn)),
              KV('Expiry', this.data.dday(d, x.expiresOn)),
              KV('Audience', this.views.audLabel(d, x.audience)),
              KV(
                'Acknowledgement',
                x.mandatoryAck ? 'Mandatory (staff)' : 'Not required',
              ),
            ],
          },
          ...(x.mandatoryAck
            ? [
                {
                  h: `Acknowledgements (${t.done}/${t.tot})`,
                  items: ackRows.length
                    ? ackRows
                    : none('Nobody in this audience'),
                },
              ]
            : []),
          {
            h: 'Policy statement',
            text:
              st === 'Missing Evidence'
                ? 'Required evidence is NOT present according to your configured policy.'
                : 'Required evidence is present according to your configured policy. This is not a legal opinion.',
          },
          { h: 'Audit', items: await audit([x.id]) },
        ],
        hasActs: true,
        acts: this.views
          .cmpActs(d, x)
          .filter((y) => y !== 'Open')
          .map((y, i) => btn(`cmp:${y}`, y, i === 0 ? 'primary' : 'ghost')),
        ref: {
          id: x.id,
          number: x.number,
          title: x.title,
          version: x.version,
          hasDoc: !!x.docId,
          aud: this.views.audLabel(d, x.audience),
          pending: t.tot - t.done,
          tot: t.tot,
          exp: x.expiresOn?.toISOString().slice(0, 10) ?? null,
          ack: x.mandatoryAck,
        },
      };
    }

    if (kind === 'tplprev' || kind === 'tplhist') {
      const t = d.templates.find((y) => y.id === id || y.number === id);
      if (!t) throw notFound('Template');
      const cur = t.versions[t.versions.length - 1];
      const info = this.views.tplInfo(d, t);
      if (kind === 'tplhist')
        return {
          ...base,
          kicker: 'Version history',
          title: t.name,
          sections: [
            {
              h: 'Versions',
              items: [...t.versions].reverse().map((v) => ({
                a: `v${v.version}`,
                c: `${this.data.name(d, v.byUserId)} · ${this.data.dday(d, v.createdAt)}`,
                b: v.status,
                d: v.status === 'Draft' ? 'Editable' : 'Immutable',
              })),
            },
          ],
        };
      const r = this.templates.render(cur.content, {
        business: d.biz,
        tz: d.tz,
      });
      return {
        ...base,
        kicker: `Template preview · v${cur.version}`,
        title: t.name,
        badges: [B(info.st)],
        sections: [
          {
            h: 'Content (business details filled from your profile)',
            text: r.text.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, '[$1]'),
          },
          {
            h: 'Variables (typed)',
            bullets: ((cur.vars as string[]) ?? []).map(
              (v) =>
                `{{${v}}} — ${RECORD_VARS.includes(v) ? 'filled from the record' : 'typed in when the contract is created'}`,
            ),
          },
          {
            h: 'Signer roles',
            text: ((t.roles as string[]) ?? []).join(', ') || 'None',
          },
          { h: 'Approval policy', text: t.approval },
        ],
        hasActs: true,
        acts: this.views
          .tplActs(d, t)
          .filter((y) => y !== 'Preview')
          .slice(0, 4)
          .map((y, i) => btn(`tpl:${y}`, y, i === 0 ? 'primary' : 'ghost')),
        ref: {
          id: t.id,
          number: t.number,
          name: t.name,
          type: t.type,
          content: cur.content,
          roles: t.roles,
          approval: t.approval,
          status: info.st,
          version: t.version,
          publishedVersion: info.pub?.version ?? null,
        },
      };
    }

    if (kind === 'ct') {
      const c = this.data.ct(d, id);
      if (!c || !this.data.ctVisible(d, c)) throw notFound('Contract');
      const p = this.data.party(d, c.cpKind, c.cpId);
      const nb = this.data.noticeBy(c);
      return {
        ...base,
        kicker: 'Contract',
        title: c.title,
        ref: {
          id: c.id,
          number: c.number,
          title: c.title,
          type: c.type,
          status: c.status,
          version: c.version,
          ownerId: c.ownerId,
          start: c.startOn.toISOString().slice(0, 10),
          end: c.endOn?.toISOString().slice(0, 10) ?? null,
          notice: c.noticeDays,
          noticeBy: nb?.toISOString().slice(0, 10) ?? null,
          noticePassed: (this.data.off(d, nb) ?? 1) < 0,
          autoRenew: c.autoRenew,
          value: a.value && c.value != null ? Number(c.value) : null,
          valueLabel: this.data.val(d, c.value),
          cp: `${c.cpKind}:${c.cpId}`,
          cpName: p.name,
          docId: c.docId,
          signer: c.signerDraft,
          related: c.related,
          terms: c.terms.map((t) => ({
            id: t.id,
            term: t.term,
            value: t.value,
            source: t.source,
          })),
          obls: c.obls.map((o) => ({
            id: o.id,
            title: o.title,
            ownerId: o.ownerId,
            due: o.dueOn.toISOString().slice(0, 10),
            status: this.data.oblSt(d, o),
          })),
          amends: c.amends.map((m) => ({
            id: m.id,
            number: m.number,
            status: m.status,
            docId: m.docId,
          })),
          openApproval:
            d.approvals.find(
              (x) =>
                x.entityId === c.id &&
                ['Pending', 'Escalated'].includes(x.status),
            )?.id ?? null,
          completedSig:
            d.sigs.find(
              (s) => s.contractId === c.id && s.status === 'Completed',
            )?.id ?? null,
          acts: this.views.ctActs(d, c).filter((x) => x !== 'Open'),
        },
      };
    }

    if (kind === 'vars')
      return {
        ...base,
        kicker: 'Variable browser',
        title: 'Typed template variables',
        sections: [
          ...Object.entries(VARS).map(([h, vs]) => ({
            h,
            bullets: vs.map(
              (v) =>
                `{{${v}}}${RECORD_VARS.includes(v) ? '' : ' — typed in at creation (no Noxtill record holds it)'}`,
            ),
          })),
          {
            h: 'Rule',
            text: 'Only these typed variables are accepted. Expressions, functions and code are rejected.',
          },
        ],
      };

    if (kind === 'storage') {
      const D = this.data.docs(d);
      const sz = D.reduce((s0, x) => s0 + this.data.sizeKb(x), 0);
      return {
        ...base,
        kicker: 'Storage detail',
        title: `${(sz / 1024).toFixed(1)} MB used`,
        sections: [
          {
            h: 'By folder',
            items: d.cfg.folders.list.map((f) => ({
              a: f,
              c: `${D.filter((x) => x.folder === f).length} documents`,
              b: `${(D.filter((x) => x.folder === f).reduce((s0, x) => s0 + this.data.sizeKb(x), 0) / 1024).toFixed(1)} MB`,
              d: '',
            })),
          },
          {
            h: 'Storage',
            text: 'Private, business-scoped object storage. Downloads use signed links valid for 5 minutes. Every version is kept (with its SHA-256) until retention allows deletion.',
          },
        ],
      };
    }

    if (kind === 'audit') {
      const rows = await this.ctx.db.ctAudit.findMany({
        where: { businessId: a.rootId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        ...base,
        kicker: 'Audit · append-only',
        title: 'Contracts',
        sections: [
          {
            h: 'Latest 100 actions',
            items: rows.length
              ? rows.map((x) => ({
                  a: x.action,
                  c: `${x.actorName} · ${x.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`,
                  b: x.correlation,
                  d: x.detail,
                }))
              : none('No actions yet'),
          },
        ],
      };
    }
    return null;
  }

  dataFor(a: CtActor, s: CtScope): Promise<Data> {
    return this.data.load(a, s);
  }
}
