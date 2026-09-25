"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDeliveryAccess } from "@/lib/delivery-settings-api";
import { LoadingBlock } from "./delivery-ui";

/** The real owner-only gate for Zones, Automations and Settings: the backend decides (delivery.configure), the screen follows. */
export function OwnerGate({ title, children }: { title: string; children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["delivery-access"], queryFn: fetchDeliveryAccess, staleTime: 60000 });
  if (isLoading || !data) return <LoadingBlock label="Checking access…" />;
  if (!data.canConfigure) {
    return (
      <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: "16px", padding: "48px 20px", textAlign: "center" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "#FEF6E7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
          <svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth={2} strokeLinecap="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <div style={{ fontSize: "14.5px", fontWeight: 800, color: "#93370D" }}>{title}</div>
        <div style={{ fontSize: "12.5px", color: "#B54708", marginTop: "5px", maxWidth: "54ch", marginLeft: "auto", marginRight: "auto" }}>
          Zones, automations and settings change how every delivery is priced and routed, so they sit with the owner. Ask the owner to make changes here.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
