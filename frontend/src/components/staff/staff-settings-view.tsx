"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTimesheetSettings, updateTimesheetSettings } from "@/lib/staff-api";
import { fetchBusinessProfile, updateBusinessProfile } from "@/lib/businesses-api";
import { useSession } from "@/lib/session";
import { selectStyle, primaryBtnStyle, ToggleSwitch, handleFakeOption } from "@/components/staff/staff-ui";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const TIMEZONES = ["(GMT+5) Karachi", "(GMT+4) Dubai", "(GMT+0) London"];
const TIMEZONE_IANA: Record<string, string> = {
  "(GMT+5) Karachi": "Asia/Karachi",
  "(GMT+4) Dubai": "Asia/Dubai",
  "(GMT+0) London": "Europe/London",
};
const TIMEZONE_LABEL: Record<string, string> = Object.fromEntries(Object.entries(TIMEZONE_IANA).map(([label, iana]) => [iana, label]));
const LATE_THRESHOLD_OPTIONS = [5, 10, 15];

const rowStyle = (first: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  borderTop: first ? undefined : "1px solid var(--app-surface-2)",
  paddingTop: first ? undefined : 13,
});

export function StaffSettingsView() {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const queryClient = useQueryClient();

  const { data: timesheetSettings } = useQuery({ queryKey: ["timesheet-settings"], queryFn: fetchTimesheetSettings, enabled: isOwner });
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: fetchBusinessProfile, enabled: isOwner });

  const [lateThreshold, setLateThreshold] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);

  const threshold = Number(lateThreshold ?? timesheetSettings?.lateThresholdMinutes ?? LATE_THRESHOLD_OPTIONS[1]);
  const tzIana = timezone ?? profile?.timezone ?? "Asia/Karachi";
  const tzLabel = TIMEZONE_LABEL[tzIana] ?? TIMEZONES[0];

  const mutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        updateTimesheetSettings({ lateThresholdMinutes: threshold }),
        updateBusinessProfile({ timezone: tzIana }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-settings"] });
      queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      toast.success("Staff settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  if (!isOwner) {
    return <PermissionLockCard description="Staff settings are owner-only." />;
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Working hours &amp; attendance</h3>
        </div>
        <div className="flex flex-col gap-[13px]" style={{ padding: 16 }}>
          <div style={rowStyle(true)}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Default working day</span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Used when a shift has no explicit times</span>
            </span>
            <select aria-label="Default working day" onChange={(e) => handleFakeOption(e.target.value) || toast.info("Default working day — not available yet.")} style={selectStyle}>
              <option>9:00 AM – 6:00 PM</option>
              <option>10:00 AM – 7:00 PM</option>
              <option>+ Add your own…</option>
            </select>
          </div>
          <div style={rowStyle(false)}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Late threshold</span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Minutes past start before an entry is flagged late</span>
            </span>
            <select aria-label="Late threshold" value={`${threshold} minutes`} onChange={(e) => setLateThreshold(e.target.value.split(" ")[0])} style={selectStyle}>
              {LATE_THRESHOLD_OPTIONS.map((m) => <option key={m}>{m} minutes</option>)}
            </select>
          </div>
          <div style={rowStyle(false)}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Timezone</span>
            </span>
            <select aria-label="Timezone" value={tzLabel} onChange={(e) => setTimezone(TIMEZONE_IANA[e.target.value])} style={selectStyle}>
              {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Scheduling rules</h3>
        </div>
        <div className="flex flex-col gap-[13px]" style={{ padding: 16 }}>
          <div style={rowStyle(true)}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Block double bookings</span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Refuse a shift that overlaps an existing one</span>
            </span>
            <ToggleSwitch on disabled onToggle={() => undefined} label="Block double bookings" />
          </div>
          <div style={rowStyle(false)}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Minimum coverage per hour</span>
            </span>
            <select aria-label="Minimum coverage" onChange={(e) => handleFakeOption(e.target.value) || toast.info("Minimum coverage per hour — not available yet.")} style={selectStyle}>
              <option>1 person</option>
              <option>2 people</option>
              <option>3 people</option>
              <option>+ Add your own…</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1.5px solid #BFE7CF" }}>
        <div className="flex items-center gap-[9px]" style={{ padding: "14px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>AI assistance</h3>
          <span className="rounded-[6px] text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ padding: "3px 8px", background: "#E8F7EE", color: "#0E8442" }}>Approval required</span>
        </div>
        <div className="flex flex-col gap-[13px]" style={{ padding: 16 }}>
          <div className="rounded-[12px] p-[13px] text-[12.5px] leading-relaxed" style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", color: "var(--app-text-muted)" }}>
            AI can propose a roster, flag conflicts and suggest task reassignments. It never publishes a schedule, changes a permission or moves a shift on its own — every proposal waits for you.
          </div>
          <div style={rowStyle(true)}>
            <span style={{ flex: 1, minWidth: 180 }}>
              <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Require approval on every AI action</span>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Turning this off is not available in this build</span>
            </span>
            <ToggleSwitch on disabled onToggle={() => undefined} label="Require approval on AI actions" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-[11px] px-[22px] py-3 text-[13px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>
          {mutation.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </main>
  );
}
