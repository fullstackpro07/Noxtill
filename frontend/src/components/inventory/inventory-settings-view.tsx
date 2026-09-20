"use client";

import { INV } from "@/components/inventory/inventory-ui";
import { useSession } from "@/lib/session";

function FixedRow({ label, description, value }: { label: string; description: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 180 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "#98A2B3", marginTop: 2 }}>{description}</span>
      </span>
      <span style={{ border: `1px solid ${INV.border}`, borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#98A2B3", background: "#FAFBFC", minHeight: 44, display: "flex", alignItems: "center" }}>{value}</span>
    </div>
  );
}

export function InventorySettingsView() {
  const session = useSession();
  const isOwner = session.user.role === "owner";

  if (!isOwner) {
    return (
      <main style={{ padding: "16px 22px 26px" }}>
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>Inventory settings are owner-only</div>
          <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5 }}>These rules govern stock thresholds and reorder math, so only the owner can see them here.</div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
        These are fixed, system-wide values in this build — not per-business settings yet. They&apos;re shown here, with real numbers, so the reorder math elsewhere in this module can be checked against something.
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Reorder rules</h3>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
          <FixedRow label="Target lead-time cover" description="Suggested quantities aim at this many days of stock, on top of your low-stock threshold" value="14 days" />
          <div style={{ borderTop: "1px solid #F2F4F7", paddingTop: 13 }}>
            <FixedRow label="Velocity window" description="How far back sell-through is measured" value="30 days" />
          </div>
          <div style={{ borderTop: "1px solid #F2F4F7", paddingTop: 13 }}>
            <FixedRow label="Overstock threshold" description="Cover above this is flagged as overstocked" value="120 days" />
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Transfers &amp; counts</h3>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#344054" }}>Stock counts apply as drafts</span>
              <span style={{ display: "block", fontSize: 11.5, color: "#98A2B3", marginTop: 2 }}>A count is created as a draft and only changes stock once you apply it — that flow isn&apos;t configurable</span>
            </span>
            <span style={{ width: 40, height: 22, borderRadius: 20, background: INV.primary, position: "relative", flex: "0 0 40px" }}>
              <span style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
            </span>
          </div>
          <div style={{ borderTop: "1px solid #F2F4F7", paddingTop: 13 }}>
            <FixedRow label="Count variance needing review" description="Not available in this build — every applied count posts its adjustment immediately, at any variance" value="Not configurable" />
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>How suggestions are made</h3>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13, fontSize: 12.5, color: "#344054", lineHeight: 1.65 }}>
            Reorder quantities, stockout dates and demand forecasts are plain calculations from your own sales history — not AI. They follow the fixed formulas shown throughout this module, and nothing here ever creates a purchase order, moves stock, or applies a count adjustment on its own. Every suggestion is a starting point you act on yourself.
          </div>
        </div>
      </div>
    </main>
  );
}
