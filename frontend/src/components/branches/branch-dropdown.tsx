"use client";

import { Select } from "@/components/ui/select";
import { BRANCH_METRICS } from "@/lib/branches";
import { toast } from "@/lib/toast";

export function BranchDropdown({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          toast.info("Add-branch flow wires up in INT-009.");
          return;
        }
        onChange(e.target.value);
      }}
      className="w-48"
    >
      <option value="all">All branches</option>
      {BRANCH_METRICS.map((b) => (
        <option key={b.branchId} value={b.branchId}>
          {b.name}
        </option>
      ))}
      <option value="__add__">+ Add branch</option>
    </Select>
  );
}
