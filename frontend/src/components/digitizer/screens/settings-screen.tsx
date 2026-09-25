"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDigitizerSettings, removeDigitizerAlias, updateDigitizerSetting, type SettingItem, type SettingsResponse } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY, useDigitizerData } from "../digitizer-data";
import { Card, Chip, ErrorBlock, LoadingBlock, whenLabel } from "../digitizer-ui";

const KEY = [DIGITIZER_KEY, "settings"];

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      onClick={disabled ? undefined : () => onChange(!on)}
      style={{ width: "36px", height: "20px", borderRadius: "999px", background: on ? "#16A34A" : "#C3CAD4", position: "relative", cursor: disabled ? "wait" : "pointer", flexShrink: 0, transition: "background .15s", opacity: disabled ? 0.6 : 1 }}
    >
      <div style={{ position: "absolute", top: "2px", left: on ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </div>
  );
}

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { notify, notifyError } = useDigitizerStore();
  const { refresh } = useDigitizerData();
  const q = useQuery({ queryKey: KEY, queryFn: fetchDigitizerSettings });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean | number }) => updateDigitizerSetting(key, value),
    onSuccess: (data: SettingsResponse) => {
      queryClient.setQueryData(KEY, data);
      refresh();
      notify("Setting saved", "It applies to every document read or reviewed from now on.");
    },
    onError: (e: unknown) => notifyError("Could not save", e instanceof Error ? e.message : "Please try again."),
  });
  const removeAlias = useMutation({
    mutationFn: (id: string) => removeDigitizerAlias(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      refresh();
      notify("Correction removed", "The scanner will no longer auto-apply it to future scans.");
    },
    onError: (e: unknown) => notifyError("Could not remove", e instanceof Error ? e.message : "Please try again."),
  });

  if (q.isLoading) return <LoadingBlock label="Loading settings…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { groups, principles, aliases } = q.data;

  const control = (item: SettingItem) => {
    if (item.control === "toggle") return <Switch on={!!item.on} disabled={save.isPending} onChange={(next) => save.mutate({ key: item.key, value: next })} />;
    if (item.control === "number" && item.number) {
      const n = item.number;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <input
            type="range"
            min={n.min}
            max={n.max}
            step={n.step}
            defaultValue={n.value}
            key={`${item.key}-${n.value}`}
            aria-label={item.label}
            disabled={save.isPending}
            onMouseUp={(e) => save.mutate({ key: item.key, value: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => save.mutate({ key: item.key, value: Number((e.target as HTMLInputElement).value) })}
            onKeyUp={(e) => save.mutate({ key: item.key, value: Number((e.target as HTMLInputElement).value) })}
            style={{ width: "110px", accentColor: "#16A34A" }}
          />
          <Chip tone="neutral" style={{ height: "21px", fontSize: "10px", minWidth: "44px", justifyContent: "center" }}>{item.value}</Chip>
        </div>
      );
    }
    return <Chip tone={item.tone} style={{ height: "21px", fontSize: "10px" }}>{item.value}</Chip>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "18px", alignItems: "start" }}>
        {groups.map((g) => (
          <Card key={g.title} padding="18px">
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <DigitizerIcon name={g.icon} size={16} style={{ color: "#15803D" }} />
              <div style={{ fontSize: "13.5px", fontWeight: 800 }}>{g.title}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "12px" }}>
              {g.items.map((item) => (
                <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 10px", borderRadius: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "2px", lineHeight: 1.45 }}>{item.meta}</div>
                  </div>
                  {control(item)}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card padding="18px">
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <DigitizerIcon name="book-open" size={16} style={{ color: "#15803D" }} />
          <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Learned corrections</div>
          <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>Replayed automatically on future scans</div>
        </div>
        <div style={{ fontSize: "12px", color: "#5B6675", lineHeight: 1.55, marginTop: "6px" }}>
          Every time you correct a misread word during review, the scanner remembers it and applies the fix on future scans. Only free-text fields are learned — never phones, emails, amounts or dates.
        </div>
        {aliases.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "12.5px", color: "#94A3B8", border: "1px dashed #E6E8EC", borderRadius: "10px", marginTop: "12px" }}>Nothing learned yet. Correct a misread word during review and it will appear here.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "12px" }} className="nx-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #E6E8EC" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", fontWeight: 800, color: "#7A8798" }}>The scanner read</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", fontWeight: 800, color: "#7A8798" }}>You corrected it to</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", fontWeight: 800, color: "#7A8798" }}>Last used</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: "11px", fontWeight: 800, color: "#7A8798" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {aliases.map((al) => (
                  <tr key={al.id} style={{ borderBottom: "1px solid #F3F4F7" }}>
                    <td style={{ padding: "10px 12px", fontSize: "12px", color: "#7A8798", textDecoration: "line-through" }}>{al.rawText}</td>
                    <td style={{ padding: "10px 12px", fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>{al.correctedText}</td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", color: "#94A3B8" }}>{whenLabel(al.updatedAt)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <button type="button" onClick={() => removeAlias.mutate(al.id)} disabled={removeAlias.isPending} aria-label={`Forget ${al.rawText}`} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94A3B8", padding: "4px" }}>
                        <DigitizerIcon name="trash-2" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="18px" style={{ borderColor: "#FBD5D2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <DigitizerIcon name="shield-check" size={16} style={{ color: "#B42318" }} />
          <div style={{ fontSize: "13.5px", fontWeight: 800 }}>How this module behaves</div>
          <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>Built into the pipeline, not offered as settings</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "10px", marginTop: "14px" }}>
          {principles.map((po) => (
            <div key={po} style={{ display: "flex", gap: "9px", alignItems: "flex-start", padding: "11px 12px", border: "1px solid #EEF0F3", borderRadius: "11px" }}>
              <DigitizerIcon name="circle-check" size={15} style={{ color: "#15803D", marginTop: "1px", flexShrink: 0 }} />
              <div style={{ fontSize: "12px", color: "#45505F", lineHeight: 1.5 }}>{po}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
