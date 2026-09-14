"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, MapPin, Plus, RefreshCw, ChevronDown, Check } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { useDashboardStore, OVERVIEW_RANGE_LABEL, type OverviewRangeKey } from "@/store/dashboard-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import type { SessionBusiness } from "@/lib/session";

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
};

export function OverviewToolbar({ branches, onAddWidget }: { branches: SessionBusiness["branches"]; onAddWidget: () => void }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const overviewRange = useDashboardStore((s) => s.overviewRange);
  const setOverviewRange = useDashboardStore((s) => s.setOverviewRange);
  const selectedBranch = useBranchContextStore((s) => s.selectedBranchId);
  const setSelectedBranch = useBranchContextStore((s) => s.setSelectedBranchId);

  const branchLabel = selectedBranch === null ? "All Locations" : (branches.find((b) => b.id === selectedBranch)?.name ?? "All Locations");

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      <DropdownMenu>
        <DropdownTrigger>
          <span style={btnStyle}>
            <Calendar className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden />
            {OVERVIEW_RANGE_LABEL[overviewRange]}
            <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          </span>
        </DropdownTrigger>
        <DropdownContent>
          {(Object.keys(OVERVIEW_RANGE_LABEL) as OverviewRangeKey[]).map((key) => (
            <DropdownItem key={key} active={overviewRange === key} onSelect={() => setOverviewRange(key)}>
              <span className="flex-1">{OVERVIEW_RANGE_LABEL[key]}</span>
              {overviewRange === key && <Check className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden />}
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownMenu>

      {branches.length >= 2 && (
        <DropdownMenu>
          <DropdownTrigger>
            <span style={btnStyle}>
              <MapPin className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden />
              {branchLabel}
              <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            </span>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem active={selectedBranch === null} onSelect={() => setSelectedBranch(null)}>
              <span className="flex-1">All Locations</span>
              {selectedBranch === null && <Check className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden />}
            </DropdownItem>
            {branches.map((b) => (
              <DropdownItem key={b.id} active={selectedBranch === b.id} onSelect={() => setSelectedBranch(b.id)}>
                <span className="flex-1">{b.name}</span>
                {selectedBranch === b.id && <Check className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden />}
              </DropdownItem>
            ))}
          </DropdownContent>
        </DropdownMenu>
      )}

      <button type="button" onClick={onAddWidget} style={btnStyle}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add widget
      </button>
      <button
        type="button"
        onClick={useDashboardStore.getState().enterCustomize}
        style={{ ...btnStyle, gap: 0 }}
      >
        Customize Dashboard
      </button>
      <button
        type="button"
        onClick={async () => {
          setRefreshing(true);
          await queryClient.invalidateQueries();
          setTimeout(() => setRefreshing(false), 500);
        }}
        style={btnStyle}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
        Refresh
      </button>
    </div>
  );
}
