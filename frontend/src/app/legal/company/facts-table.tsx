"use client";

import { useState } from "react";
import { s } from "@/components/site/legal/s";

const REGISTERED = ["Legal business name", "Jurisdiction", "Entity type", "Formation date", "Arizona ACC Business ID", "Principal business address"];

export function FactsTable({ rows }: { rows: string[][] }) {
  const [copied, setCopied] = useState("");
  const [msg, setMsg] = useState("");
  const copy = (k: string, v: string) => {
    const done = (ok: boolean) => {
      setCopied(ok ? k : "");
      setMsg(ok ? `${k} copied to clipboard.` : "Copy failed — select the text and copy it manually.");
    };
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => done(true), () => done(false));
    else done(false);
  };
  const th = s("text-align: left; padding: 12px 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #4C5B63; border-bottom: 1px solid #D9E8E0;");
  return (
    <>
      <table style={s("width: 100%; border-collapse: collapse; font-size: 16px; border-top: 2px solid #064F3B;")}>
        <caption style={s("text-align: left; padding: 0 0 10px; font-size: 13px; color: #4C5B63;")}>Verified public information for Noxtill LLC</caption>
        <thead>
          <tr>
            <th scope="col" style={th}>
              Item
            </th>
            <th scope="col" style={th}>
              Details
            </th>
            <th scope="col" style={s("padding: 12px 8px; border-bottom: 1px solid #D9E8E0;")} data-noprint="true">
              <span className="nl-sr">Copy</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={s("border-bottom: 1px solid #E3EEE8;")}>
              <th scope="row" style={s("text-align: left; padding: 14px 8px; font-weight: 700; width: 34%; vertical-align: top;")}>
                {k}
              </th>
              <td style={s("padding: 14px 8px; line-height: 1.5;")}>
                <span style={s("font-weight: 500;")}>{v}</span>{" "}
                {REGISTERED.includes(k) ? (
                  <span
                    style={s("display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 7px; border-radius: 6px; background: #DDF6EA; color: #04573C;")}
                  >
                    Public record
                  </span>
                ) : null}
              </td>
              <td style={s("padding: 10px 8px; text-align: right; width: 90px;")} data-noprint="true">
                <button
                  type="button"
                  onClick={() => copy(k, v)}
                  aria-label={`Copy ${k}`}
                  style={s("height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid #CFDDD5; background: #FFFFFF; color: #064F3B; font: 700 13px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
                >
                  {copied === k ? "Copied" : "Copy"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status" aria-live="polite" style={s("margin: 8px 0 0; min-height: 20px; font-size: 13px; color: #04573C;")}>
        {msg}
      </p>
    </>
  );
}
