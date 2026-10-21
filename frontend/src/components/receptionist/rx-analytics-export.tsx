"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { exportVoiceAnalytics } from "@/lib/voice-analytics-export-api";
import { Card, SmallBtn } from "./rx-ui";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Download the saved call log for a date range as CSV (managers only; caller numbers masked). */
export function AnalyticsExportCard() {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(isoDay(today));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await exportVoiceAnalytics(from, to);
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      setMessage({ text: `${result.rowCount} call${result.rowCount === 1 ? "" : "s"} exported.` });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError && error.status === 403 ? "Exporting call data needs voice management access." : error instanceof Error ? error.message : "Export failed.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card pad={16}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="text-[13px] font-extrabold">Export call data</div>
          <div className="mt-1 text-[11px] leading-[1.5] text-[color:var(--app-text-faintest,#667085)]">
            One row per saved call: status, outcome, AI agent version, human connection, booking, attribution basis, consent and provider-priced cost. Caller numbers are masked; up to 92 days.
          </div>
        </div>
        <label className="text-[11px] font-bold text-[#5B6675]">
          From
          <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="ml-1.5 h-8 rounded-[8px] border border-[#D5DAE2] px-2 text-[12px]" />
        </label>
        <label className="text-[11px] font-bold text-[#5B6675]">
          To
          <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="ml-1.5 h-8 rounded-[8px] border border-[#D5DAE2] px-2 text-[12px]" />
        </label>
        <SmallBtn icon="file-text" disabled={busy || !from || !to} onClick={() => void download()}>
          {busy ? "Exporting…" : "Export CSV"}
        </SmallBtn>
      </div>
      {message ? <p role={message.error ? "alert" : "status"} className={`mb-0 mt-2 text-[11px] ${message.error ? "text-[#B42318]" : "text-[#166534]"}`}>{message.text}</p> : null}
    </Card>
  );
}
