"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { useBranchContextStore } from "@/store/branch-context-store";
import type { SessionBusiness } from "@/lib/session";

/** Only rendered when a business has branches — single-location businesses never see this (FE-002 / BE-059). */
export function BranchSwitcher({ branches }: { branches: SessionBusiness["branches"] }) {
  const selected = useBranchContextStore((s) => s.selectedBranchId);
  const setSelected = useBranchContextStore((s) => s.setSelectedBranchId);
  if (branches.length < 2) return null;

  const label = selected === null ? "All branches" : branches.find((b) => b.id === selected)?.name;

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <span className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
          <span className="max-w-28 truncate">{label}</span>
          <ChevronsUpDown className="h-3 w-3 text-fg-faint" aria-hidden />
        </span>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem active={selected === null} onSelect={() => setSelected(null)}>
          <span className="flex-1">All branches</span>
          {selected === null && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
        </DropdownItem>
        {branches.map((branch) => (
          <DropdownItem key={branch.id} active={selected === branch.id} onSelect={() => setSelected(branch.id)}>
            <span className="flex-1">{branch.name}</span>
            {selected === branch.id && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}
