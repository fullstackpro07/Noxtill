"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, Search } from "lucide-react";
import Link from "next/link";
import { fetchAssistantHistory, type HistoryKind, type HistoryRow } from "@/lib/assistant-api";
import { formatDate, formatTime } from "@/lib/format";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { AI, KpiTile, KpiSkeleton, EmptyBlock, primaryBtnStyle } from "@/components/assistant/ai-assistant-ui";

const KIND_LABELS: Record<HistoryKind, string> = { business: "Business", help: "Help", voice: "Voice" };
const KIND_BADGE: Record<HistoryKind, { bg: string; fg: string }> = {
  business: { bg: "#E8F7EE", fg: "#0E8442" },
  help: { bg: "#EEF4FF", fg: "#3538CD" },
  voice: { bg: "#F5EBFE", fg: "#7E22CE" },
};

/** Real mode of the `topic` field every row already carries (derived server-side from the tool
 * actually called, the help article actually matched, or the voice action actually taken) — not a
 * client-side word-frequency guess over titles. */
function mostAskedTopic(rows: HistoryRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.topic, (counts.get(r.topic) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [topic, count] of counts) {
    if (count > bestCount) {
      best = topic;
      bestCount = count;
    }
  }
  return best;
}

export function ChatHistoryView() {
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("All topics");
  const [kindFilter, setKindFilter] = useState<"All types" | HistoryKind>("All types");
  const { openHistoryEntry, openDeleteHistoryEntry } = useAiAssistantDrawer();

  const { data: rows = [], isPending, isError, refetch } = useQuery({ queryKey: ["assistant-history"], queryFn: fetchAssistantHistory });

  const topics = useMemo(() => Array.from(new Set(rows.map((r) => r.topic))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || r.title.toLowerCase().includes(q) || r.topic.toLowerCase().includes(q)) &&
        (topicFilter === "All topics" || r.topic === topicFilter) &&
        (kindFilter === "All types" || r.kind === kindFilter),
    );
  }, [rows, search, topicFilter, kindFilter]);

  const totalQuestions = rows.reduce((sum, r) => sum + r.questionCount, 0);
  const topic = useMemo(() => mostAskedTopic(rows), [rows]);
  const avgQ = rows.length > 0 ? (totalQuestions / rows.length).toFixed(1) : "0";

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>Couldn&apos;t load history</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: AI.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Interactions" value={String(rows.length)} />
            <KpiTile label="Questions asked" value={String(totalQuestions)} />
            <KpiTile label="Most-asked topic" value={topic ?? "—"} />
            <KpiTile label="Questions per interaction" value={avgQ} />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: 9, flexWrap: "wrap" }}>
          <span style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#98A2B3" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions and topics…"
              aria-label="Search history"
              style={{ width: "100%", padding: "11px 12px 11px 36px", border: `1px solid ${AI.border}`, borderRadius: 10, fontSize: 12.5, background: "#F9FAFB", minHeight: 42 }}
            />
          </span>
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            aria-label="Topic"
            style={{ border: `1px solid ${AI.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 42 }}
          >
            <option>All topics</option>
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "All types" | HistoryKind)}
            aria-label="Type"
            style={{ border: `1px solid ${AI.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 42 }}
          >
            <option>All types</option>
            <option value="business">Business</option>
            <option value="help">Help</option>
            <option value="voice">Voice</option>
          </select>
        </div>

        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock
            icon={MessagesSquare}
            iconBg="#F2F4F7"
            iconColor="#98A2B3"
            title={rows.length === 0 ? "No previous activity" : "Nothing matches these filters"}
            description={rows.length === 0 ? "Business Chat, Help Assistant and Voice Assistant activity will show up here." : undefined}
            action={
              <Link href="/assistant/chat" style={primaryBtnStyle}>
                Start a new conversation
              </Link>
            }
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>When</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>First question</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Topic</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Messages</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Last activity</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const badge = KIND_BADGE[r.kind];
                  return (
                    <tr key={`${r.kind}-${r.id}`} onClick={() => openHistoryEntry(r.kind, r.id)} style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}>
                      <td style={{ padding: "12px 17px", fontSize: 12, fontWeight: 600, color: "#344054", whiteSpace: "nowrap" }}>
                        {formatDate(r.createdAt)}, {formatTime(r.createdAt)}
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#0E8442", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{r.topic}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: badge.bg, color: badge.fg }}>{KIND_LABELS[r.kind]}</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.questionCount}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#98A2B3", whiteSpace: "nowrap" }}>{formatDate(r.updatedAt)}</td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openDeleteHistoryEntry(r.kind, r.id, r.title)}
                          style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#667085", cursor: "pointer", minHeight: 40 }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          You see only your own activity. Deleting an entry removes only that record, never the business records it referred to.
        </div>
      </div>
    </main>
  );
}
