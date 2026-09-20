import type { ReportData, ReportKpi } from './report-data.types';
import type { BusinessInfo } from './report-builders.service';

export interface RenderMeta {
  generatedAt: Date;
  generatedBy: string;
  version: number;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deltaColor(kpi: ReportKpi): string {
  if (!kpi.deltaDir || kpi.deltaDir === 'flat') return '#94A3B8';
  const good = kpi.upIsGood !== false;
  const isUp = kpi.deltaDir === 'up';
  return isUp === good ? '#15803D' : '#B42318';
}

/**
 * The report as a printable document — the same structure the on-screen preview shows (letterhead,
 * meta strip, executive summary, KPI cards, chart, table, notes and definitions), rendered from the
 * exact `ReportData` that is stored as the run's snapshot.
 */
export function renderReportHtml(
  data: ReportData,
  business: BusinessInfo,
  meta: RenderMeta,
): string {
  const when = meta.generatedAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: business.timezone,
  });
  const contact = [business.address, business.phone].filter(Boolean).join(' · ');

  const kpis = data.kpis
    .map(
      (k) => `
      <div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value">${esc(k.display)}</div>
        ${k.delta ? `<div class="kpi-delta" style="color:${deltaColor(k)}">${esc(k.delta)}</div>` : ''}
      </div>`,
    )
    .join('');

  let bars = '';
  if (data.bars && data.bars.bars.length > 0) {
    const max = Math.max(...data.bars.bars.map((b) => b.value), 1);
    bars = `
      <div class="block">
        <div class="block-title">${esc(data.bars.title)}</div>
        <div class="bars">
          ${data.bars.bars
            .map(
              (b) => `
            <div class="bar-col">
              <div class="bar-val">${b.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
              <div class="bar" style="height:${Math.max((b.value / max) * 100, b.value > 0 ? 3 : 0)}%"></div>
              <div class="bar-label">${esc(b.label)}</div>
            </div>`,
            )
            .join('')}
        </div>
      </div>`;
  }

  let table = '';
  if (data.table) {
    const t = data.table;
    table = `
      <div class="block">
        <div class="block-title">${esc(t.title)}</div>
        <table>
          <thead><tr>${t.columns.map((c) => `<th style="text-align:${c.align}">${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${
              t.rows.length === 0
                ? `<tr><td colspan="${t.columns.length}" class="empty">${esc(t.emptyText)}</td></tr>`
                : t.rows
                    .map(
                      (r) =>
                        `<tr>${t.columns.map((c) => `<td style="text-align:${c.align}">${esc(r[c.key] ?? '')}</td>`).join('')}</tr>`,
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>`;
  }

  const metaItems: [string, string][] = [
    ['Period', data.periodLabel],
    ['Branch', business.name],
    ['Generated', when],
    ['Version', `v${meta.version}`],
    ['Records', data.recordsCount.toLocaleString('en-US')],
    ['Validation', data.validation.status === 'reconciled' ? 'Reconciled' : data.validation.status === 'warning' ? 'Warning' : 'Critical'],
  ];

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0F172A;padding:36px 40px;font-size:12px}
  .head{display:flex;align-items:flex-start;gap:14px;padding-bottom:18px;border-bottom:2px solid #0C1727}
  .logo{width:38px;height:38px;border-radius:9px;background:#16A34A;color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center}
  .biz{flex:1}.biz-name{font-size:15px;font-weight:800}.biz-contact{font-size:10.5px;color:#7A8798;margin-top:2px}
  .rep{text-align:right}.rep-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8}.rep-title{font-size:12.5px;font-weight:800;margin-top:3px}
  .meta{display:flex;gap:22px;margin-top:16px;flex-wrap:wrap}
  .meta-l{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#94A3B8}.meta-v{font-size:11px;font-weight:700;margin-top:3px}
  .summary{margin-top:20px;padding:14px;border:1px solid #E6E8EC;border-radius:8px;background:#FAFBFC}
  .summary-l{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8}
  .summary-t{font-size:12px;line-height:1.65;margin-top:7px}
  .kpis{display:flex;gap:12px;margin-top:18px;flex-wrap:wrap}
  .kpi{flex:1;min-width:130px;border:1px solid #E6E8EC;border-radius:8px;padding:12px}
  .kpi-label{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94A3B8}
  .kpi-value{font-size:18px;font-weight:800;margin-top:6px}.kpi-delta{font-size:9.5px;font-weight:700;margin-top:4px}
  .block{margin-top:22px}.block-title{font-size:12px;font-weight:800;margin-bottom:10px}
  .bars{display:flex;align-items:flex-end;gap:8px;height:120px}
  .bar-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}
  .bar{width:100%;background:#16A34A;opacity:.85;border-radius:3px 3px 0 0;min-height:0}
  .bar-val{font-size:8.5px;color:#5B6675}.bar-label{font-size:8.5px;color:#94A3B8}
  table{width:100%;border-collapse:collapse}
  th{padding:6px 8px;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#45505F;border-bottom:1px solid #0C1727}
  td{padding:7px 8px;font-size:11px;border-bottom:1px solid #EEF0F3}
  td.empty{text-align:center;color:#94A3B8;padding:14px}
  .notes{margin-top:24px;padding-top:12px;border-top:1px solid #E6E8EC}
  .note{font-size:10px;color:#5B6675;line-height:1.5;margin-top:5px}
  .foot{margin-top:14px;font-size:9.5px;color:#94A3B8}
</style></head>
<body>
  <div class="head">
    <div class="logo">${esc(business.name.charAt(0).toUpperCase() || 'N')}</div>
    <div class="biz"><div class="biz-name">${esc(business.name)}</div>${contact ? `<div class="biz-contact">${esc(contact)}</div>` : ''}</div>
    <div class="rep"><div class="rep-eyebrow">Report</div><div class="rep-title">${esc(data.title)}</div></div>
  </div>
  <div class="meta">${metaItems.map(([l, v]) => `<div><div class="meta-l">${esc(l)}</div><div class="meta-v">${esc(v)}</div></div>`).join('')}</div>
  <div class="summary"><div class="summary-l">Executive summary</div><div class="summary-t">${esc(data.summary)}</div></div>
  <div class="kpis">${kpis}</div>
  ${bars}
  ${table}
  <div class="notes">
    <div class="meta-l">Notes and definitions</div>
    ${data.footnotes.map((f) => `<div class="note">${esc(f)}</div>`).join('')}
    ${data.validation.exclusions.map((x) => `<div class="note"><strong>Excluded:</strong> ${esc(x)}</div>`).join('')}
    <div class="foot">Generated by Noxtill · ${esc(when)} · v${meta.version} · ${esc(meta.generatedBy)}</div>
  </div>
</body></html>`;
}
