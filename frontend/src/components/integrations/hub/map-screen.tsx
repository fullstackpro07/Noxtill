"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorCard } from "@/components/reports/reports-ui";
import { HUB_KEYS, fetchLineage } from "@/lib/integrations-hub-api";
import { HIcon, R, card, chipStyle, errorMessage } from "./hub-ui";
import { useIntegrations } from "./integrations-store";

export function MapScreen() {
  const lineage = useQuery({ queryKey: HUB_KEYS.lineage, queryFn: fetchLineage });
  const openPanel = useIntegrations((s) => s.openPanel);

  if (lineage.error) return <ErrorCard message={errorMessage(lineage.error)} onRetry={() => void lineage.refetch()} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...card, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <HIcon name="git-fork" size={16} style={{ color: R.text }} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Connected business map</div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: R.faint }}>Where external data actually lands · click any step</div>
        </div>
        <div style={{ fontSize: 12, color: R.muted, lineHeight: 1.55, marginTop: 8, textWrap: "pretty" }}>
          This is data lineage, not decoration. Each chain shows what enters Noxtill, which part of the app receives it, and what depends on it. Each chain’s health is read live from its connections.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!lineage.data
          ? [0, 1, 2].map((i) => <div key={i} style={{ ...card, height: 118, opacity: 0.6 }} />)
          : lineage.data.chains.map((chain) => {
              const tone = chain.health.state === "healthy" ? "green" : chain.health.state === "attention" ? "amber" : "neutral";
              return (
                <div key={chain.key} style={{ ...card, padding: "16px 17px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={chipStyle(tone === "neutral" ? "neutral" : tone, { height: 24, fontSize: 11 })}>
                      <HIcon name={chain.icon} size={12} />
                      <span>{chain.title}</span>
                    </span>
                    <div style={{ fontSize: 11, color: R.faint }}>{chain.trigger}</div>
                    <div style={{ marginLeft: "auto" }}>
                      <span style={chipStyle(tone, { height: 21, fontSize: 10 })}>{chain.health.label}</span>
                    </div>
                  </div>
                  <div className="nx-scroll" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 13, overflowX: "auto", paddingBottom: 4 }}>
                    {chain.nodes.map((n, i) => (
                      <div key={`${n.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => openPanel({ type: "lineage-node", chain: chain.key, index: i })}
                          style={{ height: 30, display: "flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${i === 0 ? "#C7DBFE" : "#E1E5EB"}`, background: i === 0 ? "#EFF6FF" : "#fff", color: i === 0 ? "#1D4ED8" : R.text }}
                        >
                          <HIcon name={n.icon} size={13} />
                          <span>{n.label}</span>
                        </button>
                        {i < chain.nodes.length - 1 ? <HIcon name="arrow-right" size={13} style={{ color: "#C3CAD4" }} /> : null}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: R.faint, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${R.divider}`, lineHeight: 1.5 }}>{chain.note}</div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
