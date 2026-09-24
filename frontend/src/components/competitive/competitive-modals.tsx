"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addCompetitorByName,
  addCompetitorFromPlace,
  searchCompetitorPlaces,
  triggerCompetitorSnapshot,
  type CompetitorPriority,
  type PlaceSearchResult,
} from "@/lib/competitors-api";
import { createCompetitorObservation, type CompetitorObservationKind } from "@/lib/competitive-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { PRIORITY_KEYS, PRIORITY_LABEL, relTime } from "@/lib/competitive-insights";
import { useCompetitiveData } from "./competitive-data";
import { useCompetitiveUi } from "./competitive-store";
import { AmberNote } from "./competitive-ui";

const fieldLabel = "mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px] text-[#98A2B3]";
const inputClass =
  "min-h-[48px] w-full rounded-[11px] border border-[#E6EAF0] bg-white p-3 text-[13.5px] text-[#101828] focus:border-[#12A150] focus:outline-none focus:ring-[3px] focus:ring-[rgba(18,161,80,.12)]";
const selectField = "min-h-[48px] w-full rounded-[11px] border border-[#E6EAF0] bg-white p-3 text-[12.5px] font-bold text-[#344054]";

export function CompetitiveModals() {
  const modal = useCompetitiveUi((s) => s.modal);
  const closeAll = useCompetitiveUi((s) => s.closeAll);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, closeAll]);

  if (!modal) return null;
  const title = { add: "Add a competitor", fresh: "Where this data comes from", observe: "Record what you saw" }[modal.type];

  return (
    <>
      <style>{`@keyframes nxin{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}`}</style>
      <div
        onClick={closeAll}
        className="fixed inset-0 z-[88] flex items-center justify-center p-5"
        style={{ background: "rgba(10,27,42,.42)" }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[88vh] w-[500px] max-w-full overflow-y-auto rounded-[18px] bg-white"
          style={{ boxShadow: "0 30px 80px rgba(10,27,42,.32)", animation: "nxin .17s ease" }}
        >
          <div className="flex items-center gap-[11px] border-b border-[#F0F2F5] p-[17px]">
            <h3 className="m-0 flex-1 text-[16px] font-extrabold text-[#0F172A]">{title}</h3>
            <button
              type="button"
              onClick={closeAll}
              aria-label="Close"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[9px] border border-[#E6EAF0] bg-white text-[#475467] hover:bg-[#F9FAFB]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {modal.type === "add" && <AddCompetitor />}
          {modal.type === "fresh" && <Freshness />}
          {modal.type === "observe" && <RecordObservation competitorId={modal.competitorId} kind={modal.kind} />}
        </div>
      </div>
    </>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2.5 border-t border-[#F0F2F5] px-[17px] py-3.5">{children}</div>;
}

const cancelBtn =
  "min-h-[44px] cursor-pointer rounded-[11px] border border-[#E6EAF0] bg-white px-[18px] py-[11px] text-[12.5px] font-semibold text-[#344054]";
const confirmBtn =
  "min-h-[44px] cursor-pointer rounded-[11px] border-0 bg-[#12A150] px-5 py-[11px] text-[12.5px] font-extrabold text-white transition-colors hover:bg-[#0E8442] disabled:cursor-not-allowed disabled:opacity-60";

/* ─────────────────────────── add a competitor ─────────────────────────── */

function AddCompetitor() {
  const qc = useQueryClient();
  const closeAll = useCompetitiveUi((s) => s.closeAll);
  const { competitors } = useCompetitiveData();
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<CompetitorPriority>("keep_an_eye");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [picked, setPicked] = useState<PlaceSearchResult | null>(null);
  const atLimit = competitors.length >= MAX_COMPETITORS;

  const search = useMutation({
    mutationFn: () => searchCompetitorPlaces(name.trim()),
    onSuccess: (r) => {
      setResults(r);
      setPicked(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Search failed — please try again."),
  });

  const add = useMutation({
    mutationFn: () => (picked ? addCompetitorFromPlace(picked, priority) : addCompetitorByName(name.trim(), priority)),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["competitors"] });
      void qc.invalidateQueries({ queryKey: ["competitor-category-average"] });
      toast.success(`${c.name} added. Only their public pages will be checked.`);
      closeAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this competitor."),
  });

  return (
    <div>
      <div className="flex flex-col gap-3 p-[17px]">
        {atLimit ? (
          <AmberNote>You are watching the maximum of {MAX_COMPETITORS} competitors. Remove one from Competitors before adding another.</AmberNote>
        ) : null}
        <div>
          <label className={fieldLabel} htmlFor="cmp-name">
            Business name
          </label>
          <div className="flex gap-2">
            <input
              id="cmp-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPicked(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  e.preventDefault();
                  search.mutate();
                }
              }}
              placeholder="Their name"
              className={inputClass}
              autoFocus
            />
            <button
              type="button"
              onClick={() => search.mutate()}
              disabled={!name.trim() || search.isPending}
              className="min-h-[48px] flex-none cursor-pointer rounded-[11px] border border-[#E6EAF0] bg-white px-3.5 text-[12px] font-bold text-[#0E8442] hover:border-[#12A150] hover:bg-[#F7FCF9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {search.isPending ? "Searching…" : "Find on Google"}
            </button>
          </div>
        </div>

        {results && results.length > 0 ? (
          <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
            {results.map((r) => {
              const on = picked?.placeId === r.placeId;
              return (
                <button
                  key={r.placeId}
                  type="button"
                  onClick={() => setPicked(on ? null : r)}
                  className="flex cursor-pointer items-start justify-between gap-2 rounded-[11px] border px-3 py-2.5 text-left"
                  style={{ borderColor: on ? "#12A150" : "#E6EAF0", background: on ? "#F7FCF9" : "#fff" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold text-[#101828]">{r.name}</span>
                    {r.address ? <span className="block truncate text-[11px] text-[#98A2B3]">{r.address}</span> : null}
                  </span>
                  {r.rating != null ? <span className="flex-none text-[11.5px] font-bold text-[#475467]">{r.rating.toFixed(1)}★</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {results && results.length === 0 ? (
          <div className="text-[11.5px] leading-[1.55] text-[#98A2B3]">
            Google returned nothing for that name — Google Places may not be configured here. You can still add it by name; ratings just won&apos;t be read until a
            Google listing is linked.
          </div>
        ) : null}

        <div>
          <label className={fieldLabel} htmlFor="cmp-priority">
            How closely to watch
          </label>
          <select id="cmp-priority" value={priority} onChange={(e) => setPriority(e.target.value as CompetitorPriority)} className={selectField}>
            {PRIORITY_KEYS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <AmberNote>Only their public pages get checked. Nothing behind a login is touched, and no contact or customer data is collected.</AmberNote>
      </div>
      <Footer>
        <button type="button" onClick={closeAll} className={cancelBtn}>
          Cancel
        </button>
        <button type="button" onClick={() => add.mutate()} disabled={!name.trim() || atLimit || add.isPending} className={confirmBtn}>
          {add.isPending ? "Adding…" : picked ? "Add" : name.trim() ? "Add by name" : "Add"}
        </button>
      </Footer>
    </div>
  );
}

/* ─────────────────────────── data freshness ─────────────────────────── */

function Freshness() {
  const qc = useQueryClient();
  const closeAll = useCompetitiveUi((s) => s.closeAll);
  const { competitors, lastChecked, observations, ads, social, settings, now } = useCompetitiveData();
  const newestObs = observations.length ? new Date(observations.map((o) => o.observedAt).sort().at(-1)!) : null;

  const refresh = useMutation({
    mutationFn: () => Promise.all(competitors.map((c) => triggerCompetitorSnapshot(c.id))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitors"] });
      void qc.invalidateQueries({ queryKey: ["competitor-history"] });
      void qc.invalidateQueries({ queryKey: ["competitor-category-average"] });
      toast.success("Ratings refreshed from Google.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refresh right now — Google Places may not be configured."),
  });

  const rows: { l: string; v: string; last: string; muted?: boolean }[] = [
    {
      l: "Google listings — rating and review count",
      v: `A snapshot is taken every ${settings?.scanFrequencyDays ?? 7} day${(settings?.scanFrequencyDays ?? 7) === 1 ? "" : "s"} — earlier ones are kept`,
      last: lastChecked ? relTime(lastChecked, now) : "Not checked yet",
    },
    {
      l: "Meta Ad Library",
      v: `Read whenever Competitive Insights opens — ${Object.keys(ads).length} of ${competitors.length} competitors have a Facebook Page linked`,
      last: Object.keys(ads).length ? "On demand" : "Not linked",
    },
    {
      l: "Prices, services and offers",
      v: `${observations.length} recorded by you — nothing is scraped`,
      last: newestObs ? relTime(newestObs, now) : "None yet",
    },
    {
      l: "Instagram posting",
      v: `Read through Instagram Business Discovery — ${Object.values(social).filter((r) => r.status === "ok").length} of ${competitors.length} competitors readable`,
      last: Object.keys(social).length ? "On demand" : "No handles set",
    },
    { l: "Your reviews, products and sales", v: "Read live from your own Noxtill records", last: "Live" },
    { l: "Price lists on their websites, TikTok and Facebook posts", v: "Not collected by Noxtill", last: "Not collected", muted: true },
  ];

  return (
    <div>
      <div className="flex flex-col gap-2.5 p-[17px]">
        {rows.map((f) => (
          <div key={f.l} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#E6EAF0] p-3">
            <span className="min-w-[150px] flex-1">
              <span className="block text-[12.5px] font-bold text-[#101828]">{f.l}</span>
              <span className="mt-0.5 block text-[11px] text-[#98A2B3]">{f.v}</span>
            </span>
            <span className="text-[11.5px] font-bold" style={{ color: f.muted ? "#98A2B3" : "#0E8442" }}>
              {f.last}
            </span>
          </div>
        ))}
        <div className="rounded-[11px] border border-[#F0F2F5] bg-[#FAFBFC] p-3 text-[11.5px] leading-[1.55] text-[#667085]">
          Every rating and price keeps the date it was seen. Snapshots and observations are never overwritten, so you can always see what a figure used to be.
        </div>
      </div>
      <Footer>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || competitors.length === 0}
          className="min-h-[44px] cursor-pointer rounded-[11px] border border-[#E6EAF0] bg-white px-[18px] py-[11px] text-[12.5px] font-bold text-[#0E8442] hover:border-[#12A150] hover:bg-[#F7FCF9] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refresh.isPending ? "Refreshing…" : "Refresh ratings now"}
        </button>
        <button type="button" onClick={closeAll} className={confirmBtn}>
          Close
        </button>
      </Footer>
    </div>
  );
}

/* ─────────────────────────── record an observation ─────────────────────────── */

const KIND_LABEL: Record<CompetitorObservationKind, string> = { price: "A price", service: "A service they list", offer: "A public offer" };

function RecordObservation({ competitorId, kind: initialKind }: { competitorId?: string; kind?: CompetitorObservationKind }) {
  const qc = useQueryClient();
  const closeAll = useCompetitiveUi((s) => s.closeAll);
  const activeId = useCompetitiveUi((s) => s.activeCompetitorId);
  const { competitors } = useCompetitiveData();
  const today = new Date().toISOString().slice(0, 10);

  const [cid, setCid] = useState(competitorId ?? activeId ?? competitors[0]?.id ?? "");
  const [kind, setKind] = useState<CompetitorObservationKind>(initialKind ?? "price");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [source, setSource] = useState("");
  const [seen, setSeen] = useState(today);

  const amountNum = amount.trim() === "" ? undefined : Number(amount);
  const valid = !!cid && label.trim().length > 0 && (kind !== "price" || (amountNum != null && amountNum >= 0)) && (amountNum == null || amountNum >= 0);

  const save = useMutation({
    mutationFn: () =>
      createCompetitorObservation({
        competitorId: cid,
        kind,
        label: label.trim(),
        amount: kind === "offer" ? undefined : amountNum,
        endsAt: kind === "offer" && endsAt ? new Date(endsAt).toISOString() : undefined,
        source: source.trim() || undefined,
        // Noon UTC keeps the calendar day stable in every timezone.
        observedAt: seen ? new Date(`${seen}T12:00:00.000Z`).toISOString() : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitor-observations"] });
      toast.success("Recorded. It is kept with its date, so you can always see what it used to be.");
      closeAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save that observation."),
  });

  if (competitors.length === 0) {
    return (
      <div>
        <div className="p-[17px] text-[12.5px] leading-[1.6] text-[#475467]">Add a competitor first — an observation is always about a specific business.</div>
        <Footer>
          <button type="button" onClick={closeAll} className={confirmBtn}>
            Close
          </button>
        </Footer>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 p-[17px]">
        <div>
          <label className={fieldLabel} htmlFor="obs-comp">
            Competitor
          </label>
          <select id="obs-comp" value={cid} onChange={(e) => setCid(e.target.value)} className={selectField}>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={fieldLabel}>What did you see?</span>
          <div className="flex flex-wrap gap-[7px]">
            {(Object.keys(KIND_LABEL) as CompetitorObservationKind[]).map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="min-h-[42px] cursor-pointer rounded-[20px] border px-3.5 py-[9px] text-[12px] font-bold"
                  style={{ borderColor: on ? "#12A150" : "#E6EAF0", background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467" }}
                >
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="obs-label">
            {kind === "offer" ? "The offer" : "Service or product"}
          </label>
          <input
            id="obs-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === "offer" ? "e.g. 20% off your first visit" : "e.g. Express cut"}
            className={inputClass}
            autoFocus
          />
        </div>
        {kind !== "offer" ? (
          <div>
            <label className={fieldLabel} htmlFor="obs-amount">
              Listed price {kind === "service" ? "(leave blank if they don’t publish one)" : ""}
            </label>
            <input id="obs-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={inputClass} />
          </div>
        ) : (
          <div>
            <label className={fieldLabel} htmlFor="obs-ends">
              Ends (leave blank if no end date is published)
            </label>
            <input id="obs-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel} htmlFor="obs-source">
              Where you saw it
            </label>
            <input id="obs-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Their website" className={inputClass} />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="obs-seen">
              Date seen
            </label>
            <input id="obs-seen" type="date" max={today} value={seen} onChange={(e) => setSeen(e.target.value)} className={inputClass} />
          </div>
        </div>
        <AmberNote>
          Only record what a competitor has published on their own public pages. The first day you record anything for a competitor is treated as the starting
          point, not a change — later entries show up as changes.
        </AmberNote>
      </div>
      <Footer>
        <button type="button" onClick={closeAll} className={cancelBtn}>
          Cancel
        </button>
        <button type="button" onClick={() => save.mutate()} disabled={!valid || save.isPending} className={confirmBtn}>
          {save.isPending ? "Saving…" : "Record"}
        </button>
      </Footer>
    </div>
  );
}
