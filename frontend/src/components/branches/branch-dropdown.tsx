"use client";

import { Select } from "@/components/ui/select";
import { useBranchContextStore } from "@/store/branch-context-store";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const ALL_BRANCHES = "__all__";

export function BranchDropdown() {
  const { business } = useSession();
  const selected = useBranchContextStore((s) => s.selectedBranchId);
  const setSelected = useBranchContextStore((s) => s.setSelectedBranchId);

  return (
    <Select
      value={selected ?? ALL_BRANCHES}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          toast.info("Adding a new branch isn't available yet.");
          return;
        }
        setSelected(e.target.value === ALL_BRANCHES ? null : e.target.value);
      }}
      className="w-48"
    >
      <option value={ALL_BRANCHES}>All branches</option>
      {business.branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
      <option value="__add__">+ Add branch</option>
    </Select>
  );
}
