"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchDigitizerAssistant } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY } from "../digitizer-data";
import { useAskAssistant } from "../use-assistant";
import { Btn, Card, Chip, Empty, ErrorBlock, LoadingBlock } from "../digitizer-ui";

export function AssistantScreen() {
  const router = useRouter();
  const { openPanel, closePanel } = useDigitizerStore();
  const { ask, asking } = useAskAssistant();
  const [question, setQuestion] = useState("");
  const q = useQuery({ queryKey: [DIGITIZER_KEY, "assistant"], queryFn: fetchDigitizerAssistant });

  if (q.isLoading) return <LoadingBlock label="Reading across your documents…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { prompts, findings, anomalies, documents } = q.data;

  const go = (href: string) => {
    closePanel();
    router.push(href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ background: "#fff", border: "1px solid #DDD3FE", borderRadius: "13px", boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ width: "30px", height: "30px", flex: "0 0 30px", borderRadius: "9px", background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DigitizerIcon name="sparkles" size={16} />
          </div>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Ask about your documents</div>
          <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>Answers come from the extracted documents — nothing else</div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = question.trim();
            if (!text) return;
            void ask({ question: text });
            setQuestion("");
          }}
          style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking}
            placeholder="Ask in your own words — e.g. “which supplier did I spend most with?”"
            aria-label="Ask a question about your documents"
            style={{ flex: "1 1 280px", minWidth: 0, height: "38px", padding: "0 12px", border: "1px solid #DDD3FE", borderRadius: "10px", fontSize: "13px", background: "#FBFAFF", outline: "none" }}
          />
          <Btn primary icon={asking ? "loader" : "sparkles"} disabled={asking || !question.trim()} style={{ height: "38px" }} onClick={() => { const t = question.trim(); if (t) { void ask({ question: t }); setQuestion(""); } }}>
            {asking ? "Thinking…" : "Ask"}
          </Btn>
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: "10px", marginTop: "14px" }}>
          {prompts.map((p) => (
            <div key={p.key} onClick={() => void ask({ key: p.key })} style={{ border: "1px solid #DDD3FE", background: "#FBFAFF", borderRadius: "11px", padding: "13px", cursor: asking ? "wait" : "pointer", opacity: asking ? 0.7 : 1 }}>
              <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.4 }}>{p.label}</div>
              <div style={{ fontSize: "10.5px", color: "#6D28D9", marginTop: "6px", fontWeight: 700 }}>{p.hint}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "18px", alignItems: "start" }}>
        <Card>
          <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Cross-document analysis</div>
          <div style={{ fontSize: "11.5px", color: "#7A8798", marginTop: "4px", lineHeight: 1.5 }}>
            Upload several of the same kind of document and Noxtil compares them, separating what it observed from what it inferred.
          </div>
          {findings.length === 0 ? (
            <Empty title={documents < 2 ? "Not enough documents to compare" : "Nothing notable across your documents"} icon="layers">
              {documents < 2 ? "Findings appear once you have two or more invoices, receipts or lists — for example a gap in a supplier’s invoice numbers, or a unit cost that moved." : "No missing invoice numbers, price movements, likely duplicate invoices or undated receipts were found."}
            </Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "13px" }}>
              {findings.map((f) => (
                <div
                  key={f.finding}
                  onClick={() =>
                    openPanel({
                      kicker: `Cross-document · ${f.kind}`,
                      title: f.finding,
                      badge: f.scope,
                      badgeTone: f.kind === "observed" ? "green" : "amber",
                      rows: [
                        ["Kind", f.kind === "observed" ? "Observed" : "Inferred"],
                        ["Scope", f.scope],
                        ["Evidence", f.evidence],
                        ["Confidence", f.kind === "observed" ? "Read directly from the documents" : "Low — concluded from a few fields, not confirmed"],
                        ["Action taken", "None", "pos"],
                      ],
                      bulletsTitle: f.kind === "observed" ? "This was read, not deduced" : "This is a guess",
                      bullets:
                        f.kind === "observed"
                          ? ["Every figure was read from a document you uploaded", "No conclusion is drawn about why — only what the documents say", "Nothing has been flagged as a problem or changed"]
                          : ["Matching fields are suggestive, not proof", "Two genuine documents can share a date, supplier and total", "Open both and decide for yourself"],
                      note: "Observed and inferred are labelled differently because the distinction matters.",
                      primary: "Open the documents",
                      onPrimary: () => go(`/digitizer/review?batch=${f.documentIds[0]}`),
                      secondary: "Close",
                    })
                  }
                  style={{ border: "1px solid #EEF0F3", borderRadius: "11px", padding: "12px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <Chip tone={f.kind === "observed" ? "green" : "amber"} style={{ height: "20px", fontSize: "9.5px" }}>{f.kind === "observed" ? "Observed" : "Inferred"}</Chip>
                    <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>{f.scope}</div>
                  </div>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, marginTop: "8px", lineHeight: 1.4 }}>{f.finding}</div>
                  <div style={{ fontSize: "11px", color: "#5B6675", marginTop: "5px", lineHeight: 1.45 }}>{f.evidence}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ borderColor: "#FBD5D2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <DigitizerIcon name="triangle-alert" size={16} style={{ color: "#B42318" }} />
            <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Anomalies worth a look</div>
          </div>
          {anomalies.length === 0 ? (
            <Empty title="No anomalies" icon="circle-check">Amounts, stock counts, dates and quantities in your open documents look ordinary against what you have recorded.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "13px" }}>
              {anomalies.map((a, i) => (
                <div
                  key={`${a.documentId}-${a.title}-${i}`}
                  onClick={() =>
                    openPanel({
                      kicker: "Anomaly",
                      title: a.title,
                      badge: `Confidence: ${a.confidence}`,
                      badgeTone: a.confidence === "high" ? "red" : "amber",
                      rows: [
                        ["What was noticed", a.title],
                        ["Reason", a.reason],
                        ["Document", a.documentName],
                        ["Compared against", a.basis],
                        ["Figure adjusted", "No", "pos"],
                        ["Blocks import", a.blocksImport ? "Yes — for the affected record" : "No — flagged only"],
                        ["What Noxtill concluded", "Nothing — this is a prompt to look", "muted"],
                      ],
                      bulletsTitle: "How to read an anomaly",
                      bullets: ["Unusual is not the same as wrong — a large purchase is unusual and perfectly real", "Noxtill did not change the figure to something more plausible", "Where handwriting is involved, a misread is as likely as a genuine outlier"],
                      note: "An anomaly is a prompt to look, not a conclusion.",
                      primary: "Open the document",
                      onPrimary: () => go(`/digitizer/review?batch=${a.documentId}`),
                      secondary: "Close",
                    })
                  }
                  style={{ border: "1px solid #EEF0F3", borderRadius: "11px", padding: "12px", cursor: "pointer" }}
                >
                  <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.4 }}>{a.title}</div>
                  <div style={{ fontSize: "11px", color: "#5B6675", marginTop: "5px", lineHeight: 1.45 }}>{a.reason}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "9px", flexWrap: "wrap" }}>
                    <Chip tone={a.confidence === "high" ? "red" : "amber"} style={{ height: "20px", fontSize: "9.5px" }}>{a.confidence === "high" ? "High" : "Medium"}</Chip>
                    <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>{a.basis} · {a.documentName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "12px", lineHeight: 1.5 }}>An anomaly is a prompt to look, not a conclusion. None of these has changed any figure.</div>
        </Card>
      </div>
    </div>
  );
}
