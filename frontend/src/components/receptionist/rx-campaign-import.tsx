"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { importCampaignContacts, type CampaignImportResult } from "@/lib/voice-outbound-api";
import { SmallBtn } from "./rx-ui";

const readable = (value: string) => value.replaceAll("_", " ");

/** Minimal CSV reader for name/phone/email columns (quoted fields supported). */
function parseCsv(text: string): { rows: { name: string; phone: string; email?: string }[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], error: "The file needs a header row and at least one contact." };
  const split = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const nameAt = header.indexOf("name");
  const phoneAt = header.indexOf("phone");
  const emailAt = header.indexOf("email");
  if (nameAt < 0 || phoneAt < 0) return { rows: [], error: "The header must include name and phone columns." };
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    return { name: cells[nameAt] ?? "", phone: cells[phoneAt] ?? "", ...(emailAt >= 0 && cells[emailAt] ? { email: cells[emailAt] } : {}) };
  });
  if (rows.length > 200) return { rows: [], error: "Upload at most 200 contacts at a time." };
  return { rows };
}

/** Draft-only contact list upload: matched to CRM by phone, new customers created without marketing consent. */
export function CampaignImport({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CampaignImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    const parsed = parseCsv(await file.text());
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      setResult(await importCampaignContacts(campaignId, parsed.rows));
      await qc.invalidateQueries({ queryKey: ["voice-outbound-campaigns"] });
      await qc.invalidateQueries({ queryKey: ["voice-outbound-audience"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[10px] border border-[#E6E8EC] p-3 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-[12px] font-extrabold">Upload contacts (CSV)</h2>
          <p className="mb-0 mt-0.5 text-[10px] text-[#7A8798]">
            Columns: name, phone, email (optional). Existing customers are matched by phone; new ones are added to the CRM with marketing consent off. Run the eligibility preview again afterwards.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <SmallBtn disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Choose file"}</SmallBtn>
      </div>
      {error ? <p role="alert" className="mb-0 mt-2 text-[#B42318]">{error}</p> : null}
      {result ? (
        <p role="status" className="mb-0 mt-2 text-[#166534]">
          {result.matched} matched, {result.created} new customers, {result.alreadyInCampaign} already in the campaign · {result.memberCount} contacts now.
          {result.skipped.length ? <span className="text-[#B45309]"> Skipped: {result.skipped.map((s) => `row ${s.row} (${readable(s.reason)})`).join(", ")}.</span> : null}
        </p>
      ) : null}
    </section>
  );
}
