"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { useBranchContextStore } from "@/store/branch-context-store";
import { useSession } from "@/lib/session";
import { CreateBranchDialog } from "./create-branch-dialog";

const ALL_BRANCHES = "__all__";

export function BranchDropdown() {
  const { business, user } = useSession();
  const selected = useBranchContextStore((s) => s.selectedBranchId);
  const setSelected = useBranchContextStore((s) => s.setSelectedBranchId);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Select
        value={selected ?? ALL_BRANCHES}
        onChange={(e) => {
          if (e.target.value === "__add__") {
            setCreating(true);
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
        {/* Creating a branch is owner-only server-side (BRANCHES_MANAGE) — hidden here to match, not just caught as a 403 after the fact. */}
        {user.role === "owner" && <option value="__add__">+ Add branch</option>}
      </Select>
      <CreateBranchDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
