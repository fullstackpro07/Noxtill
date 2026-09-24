"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/shared/error-states";
import { RatingSparkline } from "@/components/reviews/rating-sparkline";
import {
  removeCompetitor,
  triggerCompetitorSnapshot,
  updateCompetitor,
  type CompetitorPriority,
} from "@/lib/competitors-api";
import { removeCompetitorObservation } from "@/lib/competitive-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  PRIORITY_KEYS,
  PRIORITY_LABEL,
  chip,
  readSignals,
  relTime,
  serviceRowsFor,
  shortDate,
} from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi, type ProfileTab } from "../competitive-store";
import { Card, CardHead, Chip, EmptyCard, Footnote, GhostButton, SkeletonBlock, TableCard, Th, selectClass } from "../competitive-ui";
import { useActiveCompetitor } from "../use-active-competitor";

const TABS: ProfileTab[] = ["Overview", "Services", "Pricing", "Content", "Reviews", "Changes"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ProfileScreen() {
  const router = useRouter();
  const data = useCompetitiveData();
  const { active, setActive } = useActiveCompetitor();
  const tab = useCompetitiveUi((s) => s.profileTab);
  const setTab = useCompetitiveUi((s) => s.setProfileTab);
  const openModal = useCompetitiveUi((s) => s.openModal);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={260} />;
  if (!active) {
    return (
      <EmptyCard
        title="Add competitors to start tracking market changes"
        body="A profile shows everything publicly visible about one competitor. Add one to begin."
        action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
      />
    );
  }

  const c = active.competitor;
  const pc = chip(PRIORITY_LABEL[c.priority]);

  return (
    <div className="flex flex-col gap-[15px]">
      <Card pad>
        <div className="flex flex-wrap items-start gap-[13px]">
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-[#0A1B2A] text-[15px] font-extrabold text-white">{active.init}</span>
          <span className="min-w-[180px] flex-1">
            <span className="block text-[17px] font-extrabold text-[#0F172A]">{c.name}</span>
            <span className="mt-1 block text-[12px] text-[#98A2B3]">
              Watched since {MONTHS[active.since.getMonth()]} {active.since.getFullYear()}
              {active.rating != null ? ` · ${active.rating.toFixed(1)} on Google` : ""}
            </span>
          </span>
          {data.competitors.length > 1 ? (
            <select aria-label="Competitor" value={c.id} onChange={(e) => setActive(e.target.value)} className={`${selectClass} min-h-[36px] py-1.5 text-[12px]`}>
              {data.competitors.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : null}
          <span className="rounded-[20px] px-[11px] py-1 text-[10.5px] font-extrabold" style={{ background: pc.bg, color: pc.fg }}>
            {PRIORITY_LABEL[c.priority]}
          </span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-[7px]">
        {TABS.map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="min-h-[42px] cursor-pointer rounded-[20px] border px-3.5 py-[9px] text-[12px] font-bold"
              style={{ borderColor: on ? "#12A150" : "#E6EAF0", background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467" }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {tab === "Overview" && <OverviewTab onRemoved={() => router.push("/competitive/competitors")} />}
      {tab === "Services" && <ServicesTab />}
      {tab === "Pricing" && <PricingTab />}
      {tab === "Content" && <ContentTab />}
      {tab === "Reviews" && <ReviewsTab />}
      {tab === "Changes" && <ChangesTab />}
    </div>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

function OverviewTab({ onRemoved }: { onRemoved: () => void }) {
  const data = useCompetitiveData();
  const { active } = useActiveCompetitor();
  if (!active) return null;
  const c = active.competitor;
  const sig = readSignals(active, data.input, data.events);

  const d = data.details[c.id];
  const ig = data.social[c.id];
  const missingChecks = d?.completeness?.checks.filter((k) => !k.present).map((k) => k.label.toLowerCase()) ?? [];
  const lookedUp = !!d?.profile;
  let igText = "No handle set";
  if (ig?.status === "ok") igText = `@${ig.handle}${ig.followers != null ? ` · ${ig.followers.toLocaleString("en-US")} followers` : ""}`;
  else if (c.instagramHandle) igText = `@${c.instagramHandle} · ${ig ? "can’t be read yet" : "reading…"}`;
  const facts: { l: string; v: string; src: string; unknown?: boolean; href?: string }[] = [
    { l: "Public rating", v: active.rating != null ? `${active.rating.toFixed(1)} from ${active.reviews ?? 0} reviews` : "Not read yet", src: active.rating != null ? "Observed" : "Unavailable", unknown: active.rating == null },
    {
      l: "Website",
      v: d?.profile?.website ?? (lookedUp ? "Not on their Google listing" : "No Google listing to read"),
      src: d?.profile?.website ? "Observed" : "Unavailable",
      unknown: !d?.profile?.website,
      href: d?.profile?.website ?? undefined,
    },
    { l: "Location", v: d?.profile?.address ?? (lookedUp ? "Not on their Google listing" : "No Google listing to read"), src: d?.profile?.address ? "Observed" : "Unavailable", unknown: !d?.profile?.address },
    { l: "Phone", v: d?.profile?.phone ?? (lookedUp ? "Not on their Google listing" : "No Google listing to read"), src: d?.profile?.phone ? "Observed" : "Unavailable", unknown: !d?.profile?.phone },
    {
      l: "Category",
      v: d?.profile?.categories.length ? d.profile.categories.join(", ") : lookedUp ? "Not on their Google listing" : "No Google listing to read",
      src: d?.profile?.categories.length ? "Observed" : "Unavailable",
      unknown: !d?.profile?.categories.length,
    },
    {
      l: "Listing completeness",
      v: d?.completeness
        ? `${d.completeness.percent}%${missingChecks.length ? ` · missing ${missingChecks.join(", ")}` : " · nothing missing"}`
        : "No Google listing to read",
      src: d?.completeness ? "Observed" : "Unavailable",
      unknown: !d?.completeness,
    },
    {
      l: "Instagram",
      v: igText,
      src: ig?.status === "ok" ? "Observed" : c.instagramHandle ? "Your record" : "Unavailable",
      unknown: ig?.status !== "ok",
    },
    { l: "Watching since", v: `${active.since.getDate()} ${MONTHS[active.since.getMonth()]} ${active.since.getFullYear()}`, src: "Your record" },
    { l: "Changes seen", v: `${active.changesTotal} in total · ${active.changesInRange} in this period`, src: "Observed" },
    { l: "Meta Ad Library page", v: c.metaPageId ? `Page ${c.metaPageId}` : "Not linked", src: c.metaPageId ? "Your record" : "Unavailable", unknown: !c.metaPageId },
    { l: "Their revenue", v: "Not knowable", src: "Unavailable", unknown: true },
    { l: "Their ad spend", v: "Not knowable", src: "Unavailable", unknown: true },
    { l: "Their customer count", v: "Not knowable", src: "Unavailable", unknown: true },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <Card overflow>
        <div className="border-b border-[#F0F2F5] px-[17px] py-[13px]">
          <h3 className="m-0 text-[14.5px] font-extrabold text-[#101828]">What is known</h3>
        </div>
        <div>
          {facts.map((f) => (
            <div key={f.l} className="flex flex-wrap items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-[11px]">
              <span className="min-w-[150px] flex-1 text-[12.5px] text-[#667085]">{f.l}</span>
              {f.href ? (
                <a href={f.href} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold">
                  {f.v}
                </a>
              ) : (
                <span className="text-[12.5px]" style={f.unknown ? { color: "#98A2B3", fontStyle: "italic" } : { color: "#101828", fontWeight: 700 }}>
                  {f.v}
                </span>
              )}
              <Chip tone={f.unknown ? "Unknown" : "Observed"} className="px-[9px] py-[3px] text-[10px]">
                {f.src}
              </Chip>
            </div>
          ))}
        </div>
      </Card>

      <Card pad>
        <h3 className="m-0 mb-[13px] text-[14.5px] font-extrabold text-[#101828]">Reading the signals</h3>
        <div className="flex flex-col gap-[11px]">
          <div className="rounded-[12px] border border-[#D5EFE0] bg-[#F7FCF9] p-[13px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#0E8442]">What they do well</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.6] text-[#344054]">{sig.strong}</div>
          </div>
          <div className="rounded-[12px] border border-[#FDD9D6] bg-[#FEF3F2] p-[13px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#912018]">Where they are weaker</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.6] text-[#344054]">{sig.weak}</div>
          </div>
          <div className="rounded-[12px] border border-[#FDE3B3] bg-[#FFFBF2] p-[13px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#93370D]">Worth watching</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.6] text-[#344054]">{sig.watch}</div>
          </div>
          <div className="text-[11.5px] leading-[1.55] text-[#98A2B3]">{sig.confidence}</div>
        </div>
      </Card>

      <ManageCard onRemoved={onRemoved} />
    </div>
  );
}

function ManageCard({ onRemoved }: { onRemoved: () => void }) {
  const qc = useQueryClient();
  const { active } = useActiveCompetitor();
  const [meta, setMeta] = useState("");
  const [handle, setHandle] = useState("");
  const [confirming, setConfirming] = useState(false);
  const c = active?.competitor;

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["competitors"] });
    void qc.invalidateQueries({ queryKey: ["competitor-history"] });
    void qc.invalidateQueries({ queryKey: ["competitor-category-average"] });
  };
  const update = useMutation({
    mutationFn: (input: { priority?: CompetitorPriority; metaPageId?: string; instagramHandle?: string }) => updateCompetitor(c!.id, input),
    onSuccess: () => {
      refreshAll();
      void qc.invalidateQueries({ queryKey: ["competitor-ads"] });
      void qc.invalidateQueries({ queryKey: ["competitor-social"] });
      toast.success("Saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save that change."),
  });
  const snapshot = useMutation({
    mutationFn: () => triggerCompetitorSnapshot(c!.id),
    onSuccess: () => {
      refreshAll();
      toast.success(`Refreshed ${c!.name}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refresh right now — Google Places may not be configured."),
  });
  const remove = useMutation({
    mutationFn: () => removeCompetitor(c!.id),
    onSuccess: () => {
      refreshAll();
      void qc.invalidateQueries({ queryKey: ["competitor-observations"] });
      toast.success("Competitor removed.");
      onRemoved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this competitor."),
  });

  if (!c) return null;
  return (
    <Card pad>
      <h3 className="m-0 mb-[13px] text-[14.5px] font-extrabold text-[#101828]">Manage this competitor</h3>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[150px] flex-1 text-[12.5px] text-[#667085]">How closely to watch</span>
          <select
            aria-label="Priority"
            value={c.priority}
            onChange={(e) => update.mutate({ priority: e.target.value as CompetitorPriority })}
            className={selectClass}
          >
            {PRIORITY_KEYS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[150px] flex-1">
            <span className="block text-[12.5px] text-[#667085]">Facebook Page ID</span>
            <span className="mt-0.5 block text-[11px] text-[#98A2B3]">Lets Noxtill read their ads from the public Meta Ad Library</span>
          </span>
          <input
            aria-label="Facebook Page ID"
            value={meta}
            onChange={(e) => setMeta(e.target.value.replace(/\D/g, ""))}
            placeholder={c.metaPageId ?? "Numeric page ID"}
            className="min-h-[44px] w-[190px] rounded-[11px] border border-[#E6EAF0] px-3 text-[12.5px] focus:border-[#12A150] focus:outline-none"
          />
          <GhostButton onClick={() => update.mutate({ metaPageId: meta })} disabled={!meta || update.isPending}>
            Link page
          </GhostButton>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[150px] flex-1">
            <span className="block text-[12.5px] text-[#667085]">Instagram username</span>
            <span className="mt-0.5 block text-[11px] text-[#98A2B3]">Lets Noxtill read their public posting through your connected Instagram account</span>
          </span>
          <input
            aria-label="Instagram username"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={c.instagramHandle ? `@${c.instagramHandle}` : "@username"}
            className="min-h-[44px] w-[190px] rounded-[11px] border border-[#E6EAF0] px-3 text-[12.5px] focus:border-[#12A150] focus:outline-none"
          />
          <GhostButton onClick={() => update.mutate({ instagramHandle: handle }, { onSuccess: () => setHandle("") })} disabled={!handle.trim() || update.isPending}>
            Save
          </GhostButton>
          {c.instagramHandle ? (
            <GhostButton tone="grey" onClick={() => update.mutate({ instagramHandle: "" })} disabled={update.isPending}>
              Clear
            </GhostButton>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#F2F4F7] pt-3">
          <GhostButton onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
            {snapshot.isPending ? "Refreshing…" : "Refresh rating now"}
          </GhostButton>
          <span className="flex-1" />
          {confirming ? (
            <>
              <span className="text-[12px] text-[#B42318]">Remove {c.name} and everything recorded about it?</span>
              <GhostButton tone="grey" onClick={() => setConfirming(false)}>
                Keep
              </GhostButton>
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="min-h-[44px] cursor-pointer rounded-[10px] border-0 bg-[#B42318] px-3.5 text-[12px] font-extrabold text-white disabled:opacity-60"
              >
                {remove.isPending ? "Removing…" : "Remove"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-[44px] cursor-pointer rounded-[10px] border border-[#FDD9D6] bg-white px-3.5 text-[12px] font-bold text-[#B42318] hover:bg-[#FEF3F2]"
            >
              Stop watching
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── Services ───────────────────────── */

function RecordButton({ kind }: { kind?: "price" | "service" | "offer" }) {
  const openModal = useCompetitiveUi((s) => s.openModal);
  const { active } = useActiveCompetitor();
  return (
    <GhostButton onClick={() => openModal({ type: "observe", competitorId: active?.competitor.id, kind })}>Record what you saw</GhostButton>
  );
}

function ServicesTab() {
  const data = useCompetitiveData();
  const { active } = useActiveCompetitor();
  if (!active) return null;
  const rows = serviceRowsFor(active.competitor.id, data.observations, data.now);
  return (
    <Card overflow>
      <CardHead title="Services and prices" sub="As recorded by you from their public pages" right={<RecordButton kind="service" />} />
      {rows.length === 0 ? (
        <div className="px-[17px] py-9 text-center text-[12.5px] text-[#98A2B3]">
          Nothing recorded yet. Noxtill cannot read a competitor&apos;s price list for you — note what they publish and it will be kept with its date.
        </div>
      ) : (
        <TableCard
          minWidth={600}
          head={
            <>
              <Th edge>Service</Th>
              <Th align="right">Listed price</Th>
              <Th edge>Last seen</Th>
            </>
          }
        >
          {rows.map((s) => (
            <tr key={s.label} className="border-t border-[#F2F4F7]">
              <td className="px-[17px] py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-bold text-[#101828]">{s.label}</span>
                  {s.isNew ? <span className="rounded-[5px] bg-[#EEF4FF] px-[7px] py-0.5 text-[9.5px] font-extrabold text-[#3538CD]">New</span> : null}
                </span>
              </td>
              <td className="p-3 text-right">
                {s.amount != null ? (
                  <span className="text-[12.5px] font-extrabold text-[#101828]">{data.money(s.amount)}</span>
                ) : (
                  <span className="text-[12px] italic text-[#98A2B3]">Not listed</span>
                )}
              </td>
              <td className="px-[17px] py-3 text-[11.5px] text-[#98A2B3]">
                {relTime(s.seen, data.now)}
                {s.source ? ` · ${s.source}` : ""}
              </td>
            </tr>
          ))}
        </TableCard>
      )}
      <Footnote>Only what they publish. A blank price means they have not put one on their site, not that it is free.</Footnote>
    </Card>
  );
}

/* ───────────────────────── Pricing ───────────────────────── */

function PricingTab() {
  const qc = useQueryClient();
  const data = useCompetitiveData();
  const { active } = useActiveCompetitor();
  const remove = useMutation({
    mutationFn: removeCompetitorObservation,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitor-observations"] });
      toast.success("Observation removed.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove that observation."),
  });
  if (!active) return null;
  const mine = data.observations
    .filter((o) => o.competitorId === active.competitor.id && o.kind !== "offer")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

  return (
    <Card overflow>
      <CardHead title="Every price you recorded" sub="Newest first — old prices are never overwritten" right={<RecordButton kind="price" />} />
      {mine.length === 0 ? (
        <div className="px-[17px] py-9 text-center text-[12.5px] text-[#98A2B3]">No prices recorded for {active.competitor.name} yet.</div>
      ) : (
        mine.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3.5 border-t border-[#F2F4F7] px-[17px] py-3">
            <span className="w-[60px] flex-none text-[11.5px] font-extrabold text-[#98A2B3]">{shortDate(new Date(o.observedAt))}</span>
            <span className="min-w-[160px] flex-1 text-[12.5px] font-bold text-[#101828]">{o.label}</span>
            <span className="text-[12.5px] font-extrabold text-[#101828]">{o.amount != null ? data.money(o.amount) : "No price published"}</span>
            <span className="text-[11px] text-[#98A2B3]">{o.source ?? "Your note"}</span>
            <button
              type="button"
              onClick={() => remove.mutate(o.id)}
              disabled={remove.isPending}
              aria-label={`Remove ${o.label} observation`}
              className="cursor-pointer border-0 bg-transparent text-[11px] font-bold text-[#B42318] hover:underline"
            >
              Remove
            </button>
          </div>
        ))
      )}
      <Footnote>Removing an entry is only for typing mistakes — a real price change should be a new entry, so the history stays honest.</Footnote>
    </Card>
  );
}

/* ───────────────────────── Content ───────────────────────── */

function ContentTab() {
  const data = useCompetitiveData();
  const { active } = useActiveCompetitor();
  if (!active) return null;
  const c = active.competitor;
  const ads = data.ads[c.id];
  // (Instagram section below reads data.social)

  const ig = data.social[c.id];
  return (
    <div className="flex flex-col gap-3.5">
      <Card overflow>
        <CardHead title="Instagram posting" sub={c.instagramHandle ? `@${c.instagramHandle}` : "Not linked"} />
        {!c.instagramHandle || (ig && ig.status !== "ok") ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">
            {ig && ig.status !== "ok" ? ig.message : `Add ${c.name}'s Instagram username (Overview → Manage this competitor) to read their public posting.`}
          </div>
        ) : !ig ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] text-[#98A2B3]">Reading Instagram…</div>
        ) : (
          <>
            {[
              ["Followers", ig.followers != null ? ig.followers.toLocaleString("en-US") : "—"],
              ["Posts in the last 30 days", `${ig.capped ? "≥ " : ""}${ig.postsLast30}`],
              ["Posts in the 30 days before", `${ig.capped ? "≥ " : ""}${ig.postsPrev30}`],
              ["Formats (last 30 days)", `${ig.formats.video} video · ${ig.formats.image} image · ${ig.formats.carousel} carousel`],
              ["Most-used hashtags", ig.topics.length ? ig.topics.join(" ") : "None in the sampled captions"],
              ["Latest post", ig.latestAt ? relTime(new Date(ig.latestAt), data.now) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="flex flex-wrap items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
                <span className="min-w-[150px] flex-1 text-[12.5px] text-[#667085]">{l}</span>
                <span className="text-[12.5px] font-bold text-[#101828]">{v}</span>
              </div>
            ))}
          </>
        )}
        <Footnote>Read through Instagram Business Discovery, which only works for public business or creator accounts. Their engagement and reach are not available.</Footnote>
      </Card>
      <Card overflow>
        <CardHead title="Ads they are running" sub="Meta Ad Library" />
        {!c.metaPageId ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">
            No Facebook Page is linked for {c.name}, so their ads can&apos;t be looked up. Link one from Overview → Manage this competitor.
          </div>
        ) : data.adsLoading && !ads ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] text-[#98A2B3]">Reading the Meta Ad Library…</div>
        ) : !ads || ads.length === 0 ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">
            No ads found — either they have none running, or Meta Ad Library access isn&apos;t configured on this server.
          </div>
        ) : (
          ads.map((a) => (
            <div key={a.adArchiveId} className="border-t border-[#F2F4F7] px-[17px] py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-bold text-[#101828]">{a.pageName}</span>
                <Chip tone={a.endedAt ? "Level" : "Ahead"} className="px-2 py-0.5 text-[9.5px]">
                  {a.endedAt ? "Ended" : "Running"}
                </Chip>
                <span className="ml-auto text-[11px] text-[#98A2B3]">{a.startedAt ? `Started ${shortDate(new Date(a.startedAt))}` : "Start date unknown"}</span>
              </div>
              {a.body ? <div className="mt-1.5 line-clamp-3 text-[12px] leading-[1.55] text-[#475467]">{a.body}</div> : null}
              {a.snapshotUrl ? (
                <a href={a.snapshotUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11.5px] font-bold">
                  View ad
                </a>
              ) : null}
            </div>
          ))
        )}
        <Footnote>Nobody outside a business can see what an ad cost or earned, so those figures are never shown.</Footnote>
      </Card>
      <Card pad>
        <div className="text-[12.5px] leading-[1.65] text-[#344054]">
          <strong className="text-[#101828]">Only Instagram posting can be read.</strong> Facebook and TikTok don&apos;t share another business&apos;s posts with Noxtill, and
          Google&apos;s public Places data never includes a business&apos;s own posts.
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────── Reviews ───────────────────────── */

function ReviewsTab() {
  const data = useCompetitiveData();
  const { active } = useActiveCompetitor();
  const c = active?.competitor;
  if (!active || !c) return null;
  const details = data.details[c.id];
  const isPending = data.detailsLoading && !details;

  return (
    <div className="flex flex-col gap-3.5">
      <Card pad>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-[12px] font-semibold text-[#667085]">Public rating</div>
            <div className="mt-1.5 text-[22px] font-extrabold text-[#0F172A]">{active.rating != null ? active.rating.toFixed(1) : "—"}</div>
            <div className="mt-1 text-[10.5px] text-[#98A2B3]">{active.reviews != null ? `from ${active.reviews} reviews` : "not read yet"}</div>
          </div>
          <div className="ml-auto">
            {active.sparkline.length > 1 ? (
              <>
                <RatingSparkline data={active.sparkline} width={220} height={48} />
                <div className="mt-1 text-right text-[10.5px] text-[#98A2B3]">{active.sparkline.length} snapshots</div>
              </>
            ) : (
              <div className="max-w-[220px] text-right text-[11px] text-[#98A2B3]">A trend appears after two snapshots.</div>
            )}
          </div>
        </div>
      </Card>
      <Card overflow>
        <CardHead title="Recent public reviews" sub="The handful Google shares" />
        {isPending ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] text-[#98A2B3]">Loading reviews…</div>
        ) : !details || details.reviews.length === 0 ? (
          <div className="px-[17px] py-8 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">
            No reviews available — this competitor may have been added by name without a Google listing, or Google Places isn&apos;t configured.
          </div>
        ) : (
          details.reviews.map((r, i) => (
            <div key={i} className="border-t border-[#F2F4F7] px-[17px] py-3">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold text-[#101828]">{r.authorName}</span>
                <span className="text-[12px] font-extrabold text-[#B54708]">{r.rating}★</span>
                <span className="ml-auto text-[11px] text-[#98A2B3]">{r.relativeTime}</span>
              </div>
              <div className="mt-1.5 line-clamp-4 text-[12px] leading-[1.55] text-[#475467]">{r.text}</div>
            </div>
          ))
        )}
        <Footnote>Whether they reply to reviews can&apos;t be seen from the public data Noxtill reads.</Footnote>
      </Card>
      {details && (details.hours?.length || details.photos.length) ? (
        <Card overflow>
          <CardHead title="Their Google listing" sub="Hours and photos as published" />
          {details.hours && details.hours.length > 0 ? (
            <div className="border-t border-[#F2F4F7] px-[17px] py-3">
              <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#98A2B3]">Opening hours</div>
              <div className="flex flex-col gap-0.5 text-[12px] text-[#344054]">
                {details.hours.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            </div>
          ) : null}
          {details.photos.length > 0 ? (
            <div className="border-t border-[#F2F4F7] px-[17px] py-3">
              <div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#98A2B3]">Photos</div>
              <div className="flex gap-2 overflow-x-auto">
                {details.photos.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-16 w-16 flex-none rounded-[10px] border border-[#E6EAF0] object-cover" />
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Changes ───────────────────────── */

function ChangesTab() {
  const data = useCompetitiveData();
  const { active } = useActiveCompetitor();
  const openDrawer = useCompetitiveUi((s) => s.openDrawer);
  if (!active) return null;
  const mine = data.events.filter((e) => e.competitorId === active.competitor.id);
  return (
    <Card overflow>
      <CardHead title="Every change, kept in order" />
      {mine.length === 0 ? (
        <div className="px-[17px] py-9 text-center text-[12.5px] text-[#98A2B3]">No changes seen for {active.competitor.name} yet.</div>
      ) : (
        mine.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => openDrawer({ type: "change", id: e.id })}
            className="flex w-full cursor-pointer flex-wrap gap-3.5 border-0 border-t border-[#F2F4F7] bg-white px-[17px] py-3 text-left hover:bg-[#F7FCF9]"
          >
            <span className="w-[60px] flex-none text-[11.5px] font-extrabold text-[#98A2B3]">{shortDate(e.at)}</span>
            <span className="min-w-[180px] flex-1 text-[12.5px] leading-[1.5] text-[#344054]">{e.what}</span>
            <span className="text-[11px] text-[#98A2B3]">{e.source}</span>
          </button>
        ))
      )}
      <Footnote>Observations are never overwritten, so you can always see what a price or rating used to be.</Footnote>
    </Card>
  );
}
