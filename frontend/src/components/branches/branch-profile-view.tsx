"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, ChevronRight } from "lucide-react";
import { fetchBranches } from "@/lib/branches-api";
import { computeOpenStatus } from "@/lib/branch-hours";
import { BR } from "@/components/branches/branches-ui";
import { BranchWorkspaceDrawer } from "@/components/branches/branch-workspace-drawer";
import { ErrorBanner } from "@/components/shared/error-states";

export function BranchProfileView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openBranchId = searchParams.get("branch");
  const { data: branches = [], isPending, isError, refetch } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  if (isError) {
    return <ErrorBanner title="Couldn't load branches" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Activity size={18} style={{ color: "#0E8442" }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Branch 360</div>
          <div style={{ fontSize: 12, color: BR.textMuted, marginTop: 3 }}>
            Pick a location to open its full workspace — real sales, orders, products, inventory, customers, bookings, staff, credit, reviews, profit, activity and settings, each read from the module that owns it.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: 14 }}>
        {isPending
          ? Array.from({ length: 4 }, (_, i) => <div key={i} style={{ height: 100, borderRadius: 13, background: "#fff", border: `1px solid ${BR.border}` }} />)
          : branches.map((b) => {
              const status = computeOpenStatus(b);
              return (
                <div
                  key={b.id}
                  onClick={() => router.push(`/branches/profile?branch=${b.id}`)}
                  style={{ background: "#fff", borderRadius: 13, padding: 16, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${BR.border}` }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: 10, background: b.active ? "#E8F7EE" : "#F1F3F6", color: b.active ? "#0E8442" : "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Building2 size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                      <div style={{ fontSize: 10.5, color: BR.textFaint, marginTop: 1 }}>{b.active ? status.label : "Deactivated"}</div>
                    </div>
                    <ChevronRight size={15} style={{ color: "#C3CAD4" }} />
                  </div>
                  <div style={{ fontSize: 11, color: BR.textMuted, marginTop: 11, lineHeight: 1.5 }}>{b.country ?? "—"} · {b.currency}</div>
                </div>
              );
            })}
      </div>

      {openBranchId && <BranchWorkspaceDrawer branchId={openBranchId} onClose={() => router.push("/branches/profile")} />}
    </main>
  );
}
