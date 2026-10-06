"use client";

import { useState } from "react";
import { s } from "./s";

export interface MetaDoc {
  version: string;
  lastUpdated: string;
  lastUpdatedISO: string;
  effective: string;
  history: { version: string; date: string; summary: string; current: boolean }[];
}

/** Version / last updated / effective date row with version history, Print and Download PDF — docs/Legal pages/PolicyMeta.dc.html. */
export function PolicyMeta({ doc, policy, dark }: { doc: MetaDoc; policy: string; dark?: boolean }) {
  const [hist, setHist] = useState(false);
  const id = `hist-${policy}`;
  const fg = dark ? "#E6F4EE" : "#24343C";
  const bd = dark ? "rgba(255,255,255,0.28)" : "#CFDDD5";
  const btnBg = dark ? "#44F0B0" : "#064F3B";
  const btnFg = dark ? "#043F31" : "#FFFFFF";
  const panelBg = dark ? "rgba(255,255,255,0.06)" : "#FFFFFF";
  const ghost = `height: 40px; padding: 0 14px; border-radius: 9px; border: 1px solid ${bd}; background: transparent; color: ${fg}; font: 600 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`;
  return (
    <div style={s("font-family: 'Plus Jakarta Sans', system-ui, sans-serif; display: flex; flex-direction: column; gap: 12px;")}>
      <div style={s(`display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; font-size: 14px; color: ${fg};`)}>
        <span style={s("display: inline-flex; gap: 6px;")}>
          <span style={s("font-weight: 700;")}>Version</span>
          <span>{doc.version}</span>
        </span>
        <span style={s("display: inline-flex; gap: 6px;")}>
          <span style={s("font-weight: 700;")}>Last updated</span>
          <time dateTime={doc.lastUpdatedISO}>{doc.lastUpdated}</time>
        </span>
        <span style={s("display: inline-flex; gap: 6px;")}>
          <span style={s("font-weight: 700;")}>Effective date</span>
          <span>{doc.effective}</span>
        </span>
        <div style={s("display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto;")} data-noprint="true">
          <button type="button" aria-expanded={hist} aria-controls={id} onClick={() => setHist(!hist)} className="h-glow" style={s(ghost)}>
            Version history
          </button>
          <button type="button" onClick={() => window.print()} className="h-glow" style={s(ghost)}>
            Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            aria-describedby={`${id}-pdf`}
            style={s(`height: 40px; padding: 0 14px; border-radius: 9px; border: 0; background: ${btnBg}; color: ${btnFg}; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`)}
          >
            Download PDF
          </button>
          <span id={`${id}-pdf`} className="nl-sr">
            Opens the print dialog; choose Save as PDF.
          </span>
        </div>
      </div>
      <div id={id} hidden={!hist} data-panel="true" style={s(`border: 1px solid ${bd}; border-radius: 12px; padding: 16px 18px; background: ${panelBg}; color: ${fg};`)}>
        <h2 style={s("margin: 0 0 10px; font-size: 15px; font-weight: 700;")}>Version history</h2>
        <ol style={s("margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px;")}>
          {doc.history.map((h) => (
            <li key={h.version} style={s("display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 14px; line-height: 1.5;")}>
              <span style={s("font-weight: 700; min-width: 72px;")}>v{h.version}</span>
              <span style={s("min-width: 130px;")}>{h.date}</span>
              <span style={s("flex: 1; min-width: 200px;")}>{h.summary}</span>
              {h.current ? <span style={s("font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;")}>Current</span> : null}
            </li>
          ))}
        </ol>
        <p style={s("margin: 10px 0 0; font-size: 13px; line-height: 1.5; opacity: 0.85;")}>Superseded versions remain available at their version URL when referenced by a contract or notice.</p>
      </div>
    </div>
  );
}
