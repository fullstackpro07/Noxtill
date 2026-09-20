"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, Clock3, CalendarCheck, Users2, Boxes, Sparkles, TriangleAlert, ChevronDown, Pencil, Copy } from "lucide-react";
import { fetchBranches, copyBranchSettings } from "@/lib/branches-api";
import { useBranchesScope } from "@/components/branches/branches-context";
import { BR, Chip, type Tone } from "@/components/branches/branches-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function inert(label: string) {
  return () => toast.info(`${label} — not available in this build.`);
}

export function BranchSettingsGroupsView() {
  const router = useRouter();
  const { scopeBranchId } = useBranchesScope();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const branchId = selectedId ?? scopeBranchId ?? branches[0]?.id ?? null;
  const branch = branches.find((b) => b.id === branchId);
  const otherBranches = branches.filter((b) => b.id !== branchId);

  const duplicateNames = branches.filter((b, i) => branches.findIndex((b2) => b2.name.toLowerCase() === b.name.toLowerCase()) !== i);

  if (!branch) {
    return (
      <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
        <div style={{ fontSize: 12.5, color: BR.textFaint }}>No branches yet.</div>
      </main>
    );
  }

  const daysOpen = Object.values(branch.workingHours ?? {}).filter((ranges) => ranges.length > 0).length;
  const editHref = `/branches/${branch.id}/settings`;

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: BR.textMuted }}>Viewing settings for</span>
        <div style={{ position: "relative" }}>
          <select value={branch.id} onChange={(e) => setSelectedId(e.target.value)} style={{ height: 34, padding: "0 28px 0 11px", borderRadius: 10, border: `1px solid ${BR.borderStrong}`, fontSize: 12.5, fontWeight: 700, appearance: "none", background: "#fff" }}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: BR.textDim }} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {otherBranches.length > 0 && (
            <button type="button" onClick={() => setCopying(true)} style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 10, background: "#fff", color: BR.textSubtle, fontSize: 12.5, fontWeight: 700, border: `1px solid ${BR.borderStrong}`, cursor: "pointer" }}>
              <Copy size={13} />
              Copy settings
            </button>
          )}
          <button type="button" onClick={() => router.push(editHref)} style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 10, background: BR.primary, color: "#fff", fontSize: 12.5, fontWeight: 700, border: 0, cursor: "pointer" }}>
            <Pencil size={13} />
            Edit branch settings
          </button>
        </div>
      </div>

      {copying && branch && <CopySettingsModal targetBranchId={branch.id} otherBranches={otherBranches} onClose={() => setCopying(false)} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 18, alignItems: "start" }}>
        <SettingsGroup icon={Settings2} title="General">
          <SettingRow label="Branch name" meta="Shown across every module" value={branch.name} onEdit={() => router.push(editHref)} />
          <SettingRow label="Country" meta="Used for tax and currency defaults" value={branch.country ?? "—"} onEdit={() => router.push(editHref)} />
          <SettingRow label="Currency" meta="Applied to every amount at this branch" value={branch.currency} onEdit={() => router.push(editHref)} />
          <SettingRow label="Status" value={branch.active ? "Active" : "Deactivated"} valueTone={branch.active ? "green" : "neutral"} readOnly />
        </SettingsGroup>

        <SettingsGroup icon={Clock3} title="Operating hours">
          <SettingRow label="Days open" meta="Mon–Sun, per-day ranges" value={`${daysOpen} of 7`} onEdit={() => router.push(editHref)} />
          <SettingRow label="Nightly close" meta="When the day's till closes" value={branch.nightlyCloseTime} onEdit={() => router.push(editHref)} />
          <SettingRow label="Timezone" meta="Used to compute open/closed status" value={branch.timezone} onEdit={() => router.push(editHref)} />
          <SettingRow label="Effect on bookings" meta="Only the public booking link checks these hours — staff can still book directly outside them" value="Public link only" valueTone="amber" readOnly />
        </SettingsGroup>

        <SettingsGroup icon={CalendarCheck} title="Services">
          <SettingRow label="Available services" meta="Which services this branch offers" value="Managed in Products" onEdit={inert("Per-branch service toggles")} />
          <SettingRow label="Booking availability" meta="Required before a booking can be taken" value="Managed in Bookings" onEdit={inert("Availability editing")} />
          <SettingRow label="Deposit rules" value="Inherited" valueTone="neutral" readOnly />
        </SettingsGroup>

        <SettingsGroup icon={Users2} title="Staff">
          <SettingRow label="Manager" meta="Sets default task and escalation routing" value="Managed in Staff" onEdit={() => router.push("/branches/staff")} />
          <SettingRow label="Manager scope" value="Own branch" valueTone="neutral" readOnly />
          <SettingRow label="Schedule control" value="Read only" valueTone="amber" readOnly />
        </SettingsGroup>

        <SettingsGroup icon={Boxes} title="Inventory">
          <SettingRow label="Stock rules" meta="Reorder point per product per branch" value="Managed in Inventory" onEdit={() => router.push("/branches/inventory")} />
          <SettingRow label="Transfer approval" meta="Owner and manager by default — change who can approve in Roles & Permissions" value="Owner & Manager" valueTone="amber" onEdit={() => router.push("/staff/roles")} />
          <SettingRow label="Negative stock" value="Blocked" valueTone="amber" readOnly />
        </SettingsGroup>

        <SettingsGroup icon={Sparkles} title="Tax & payments">
          <SettingRow label="Tax label" value={branch.taxLabel} onEdit={() => router.push(editHref)} />
          <SettingRow label="Tax rate" value={`${branch.taxRate}%`} onEdit={() => router.push(editHref)} />
          <SettingRow label="Message channel" value={branch.channelPref} onEdit={() => router.push(editHref)} />
          <SettingRow label="Accepted payments" value={branch.acceptedPaymentMethods.join(", ") || "None set"} onEdit={() => router.push(editHref)} />
        </SettingsGroup>
      </div>

      {duplicateNames.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <TriangleAlert size={16} style={{ color: "#B54708" }} />
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Data quality</div>
            <div style={{ marginLeft: "auto" }}>
              <Chip tone="amber" style={{ height: 22, fontSize: 10.5 }}>
                {duplicateNames.length} issue{duplicateNames.length === 1 ? "" : "s"}
              </Chip>
            </div>
          </div>
          <div style={{ fontSize: 12, color: BR.textMuted, marginTop: 12, lineHeight: 1.5 }}>
            {duplicateNames.length} branch{duplicateNames.length === 1 ? "" : "es"} share{duplicateNames.length === 1 ? "s" : ""} a name with another branch in this group — worth a rename so reports and staff aren&apos;t ambiguous about which one they mean.
          </div>
        </div>
      )}
    </main>
  );
}

function SettingsGroup({ icon: Icon, title, children }: { icon: typeof Settings2; title: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0, background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Icon size={16} style={{ color: "#0E8442" }} />
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>{children}</div>
    </div>
  );
}

function SettingRow({ label, meta, value, valueTone, onEdit, readOnly }: { label: string; meta?: string; value: string; valueTone?: Tone; onEdit?: () => void; readOnly?: boolean }) {
  return (
    <div
      onClick={readOnly ? undefined : onEdit}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 10px", borderRadius: 10, cursor: readOnly ? "default" : "pointer" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</div>
        {meta && <div style={{ fontSize: 10.5, color: BR.textFaint, marginTop: 2, lineHeight: 1.45 }}>{meta}</div>}
      </div>
      <Chip tone={valueTone ?? "neutral"} style={{ height: 21, fontSize: 10 }}>
        {value}
      </Chip>
    </div>
  );
}

function CopySettingsModal({
  targetBranchId,
  otherBranches,
  onClose,
}: {
  targetBranchId: string;
  otherBranches: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fromBranchId, setFromBranchId] = useState(otherBranches[0]?.id ?? "");
  const fromBranch = otherBranches.find((b) => b.id === fromBranchId);

  const mutation = useMutation({
    mutationFn: () => copyBranchSettings(targetBranchId, fromBranchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success(`Settings copied from ${fromBranch?.name ?? "the source branch"}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't copy those settings — please try again."),
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(12,23,39,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(12,23,39,.28)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 0" }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em" }}>Copy branch settings</div>
          <div style={{ fontSize: 12.5, color: BR.textMuted, lineHeight: 1.6, marginTop: 6 }}>
            Copies nightly close time, tax label &amp; rate, message channel, working hours, branding and accepted payment methods from another branch — all together, replacing this branch&apos;s current values. Timezone and staff assignments are never copied.
          </div>
        </div>
        <div style={{ margin: "18px 24px 0" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: BR.textFaint, marginBottom: 6 }}>Copy from</label>
          <select value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)} style={{ width: "100%", border: `1px solid ${BR.border}`, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, background: "#fff" }}>
            {otherBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ margin: "14px 24px 0", background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#93370D" }}>
          This replaces the current branch&apos;s values immediately — there&apos;s no undo.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "20px 24px", marginTop: 18, borderTop: "1px solid #F0F2F5", background: "#FCFCFD" }}>
          <button type="button" onClick={onClose} disabled={mutation.isPending} style={{ height: 38, border: `1px solid ${BR.borderStrong}`, background: "#fff", borderRadius: 10, padding: "0 14px", fontSize: 13, fontWeight: 700, color: BR.textSubtle, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!fromBranchId || mutation.isPending}
            style={{ height: 38, border: 0, background: BR.primary, borderRadius: 10, padding: "0 14px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: !fromBranchId || mutation.isPending ? 0.6 : 1 }}
          >
            {mutation.isPending ? "Copying…" : "Copy Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
