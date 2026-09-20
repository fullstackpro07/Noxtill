"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteHistoryEntry, type HistoryKind } from "@/lib/assistant-api";
import { fetchAiSettings, updateAiSettings } from "@/lib/ai-settings-api";
import { addCustomShortcut } from "@/lib/chat-shortcuts";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { AI, AiModalShell, fieldLabelStyle, fieldInputStyle } from "@/components/assistant/ai-assistant-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const SHORTCUT_CATEGORIES = ["Sales", "Credit", "Inventory", "Customers", "Bookings", "Profit"];

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 9, padding: 17, borderTop: "1px solid #F0F2F5", justifyContent: "flex-end" }}>{children}</div>;
}

const DELETE_HISTORY_COPY: Record<HistoryKind, { noun: string; reassurance: string }> = {
  business: { noun: "conversation", reassurance: "This removes the conversation only. Every sale, order, booking and payment it referred to stays exactly as it is." },
  help: { noun: "help question", reassurance: "This removes the question and answer only — it has never changed any of your business data." },
  voice: { noun: "voice command", reassurance: "This removes the log entry only. Any real change it already made stays exactly as it is." },
};

function DeleteConvoBody({ kind, id, title }: { kind: HistoryKind; id: string; title: string }) {
  const { close } = useAiAssistantDrawer();
  const queryClient = useQueryClient();
  const copy = DELETE_HISTORY_COPY[kind];

  const mutation = useMutation({
    mutationFn: () => deleteHistoryEntry(kind, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-history"] });
      toast.success(`${copy.noun.charAt(0).toUpperCase() + copy.noun.slice(1)} deleted — your business data is untouched.`);
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this — please try again."),
  });

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#101828" }}>Delete this {copy.noun}?</div>
        <div style={{ border: `1px solid ${AI.border}`, borderRadius: 11, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{title}</div>
        </div>
        <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 11, padding: "11px 13px", fontSize: 12, color: "#0E8442", lineHeight: 1.55 }}>{copy.reassurance}</div>
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ background: "#B42318", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44, opacity: mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Deleting…" : `Delete ${copy.noun}`}
        </button>
      </ModalFooter>
    </>
  );
}

function LimitsBody() {
  const { close } = useAiAssistantDrawer();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["ai-settings"], queryFn: fetchAiSettings });
  const [costCap, setCostCap] = useState(settings ? String(settings.aiMonthlyCostCapUsd) : "");
  const [rateLimit, setRateLimit] = useState(settings ? String(settings.aiRateLimitPerMinute) : "");
  const [queryQuota, setQueryQuota] = useState(settings ? String(settings.aiQueryQuota) : "");

  const mutation = useMutation({
    mutationFn: () =>
      updateAiSettings({
        aiMonthlyCostCapUsd: Number(costCap),
        aiRateLimitPerMinute: Number(rateLimit),
        aiQueryQuota: Number(queryQuota),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-settings"], updated);
      toast.success("Limits updated.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  if (!settings) return <div style={{ padding: 17, fontSize: 12.5, color: AI.textFaint }}>Loading…</div>;

  const cc = costCap || String(settings.aiMonthlyCostCapUsd);
  const rl = rateLimit || String(settings.aiRateLimitPerMinute);
  const qq = queryQuota || String(settings.aiQueryQuota);
  const valid = Number(cc) >= 0 && Number(rl) >= 1 && Number(qq) >= 1;

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ fontSize: 12.5, color: AI.textMuted, lineHeight: 1.55 }}>Applies across every AI feature for this business — Business Chat, Help, Voice, Insights, Campaign Copy and the rest.</div>
        <div>
          <label style={fieldLabelStyle}>Monthly cost cap (USD)</label>
          <input type="number" min={0} step="0.01" value={cc} onChange={(e) => setCostCap(e.target.value)} style={fieldInputStyle} />
        </div>
        <div>
          <label style={fieldLabelStyle}>Rate limit (requests / minute)</label>
          <input type="number" min={1} value={rl} onChange={(e) => setRateLimit(e.target.value)} style={fieldInputStyle} />
        </div>
        <div>
          <label style={fieldLabelStyle}>Queries per month</label>
          <input type="number" min={1} value={qq} onChange={(e) => setQueryQuota(e.target.value)} style={fieldInputStyle} />
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} style={{ background: AI.primary, border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44, opacity: !valid || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </ModalFooter>
    </>
  );
}

function ShortcutBody() {
  const { close } = useAiAssistantDrawer();
  const [label, setLabel] = useState("");
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState(SHORTCUT_CATEGORIES[0]);

  function save() {
    addCustomShortcut({ label: label.trim(), question: question.trim(), category });
    close();
    toast.success("Shortcut saved to your chat.");
  }

  const valid = label.trim().length > 0 && question.trim().length > 0;

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={fieldLabelStyle}>Shortcut name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Weekly credit check" aria-label="Shortcut name" style={fieldInputStyle} />
        </div>
        <div>
          <label style={fieldLabelStyle}>Question it asks</label>
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which customers are overdue past 30 days?"
            aria-label="Question"
            style={{ width: "100%", border: `1px solid ${AI.border}`, borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            style={{ width: "100%", border: `1px solid ${AI.border}`, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", background: "#fff", minHeight: 48 }}
          >
            {SHORTCUT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 44 }}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!valid} style={{ background: AI.primary, border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44, opacity: valid ? 1 : 0.6 }}>
          Save shortcut
        </button>
      </ModalFooter>
    </>
  );
}

export function AiAssistantModal() {
  const { modal, close } = useAiAssistantDrawer();
  if (!modal) return null;

  const title = modal.mode === "deleteHistory" ? `Delete ${DELETE_HISTORY_COPY[modal.kind].noun}` : modal.mode === "shortcut" ? "New shortcut" : "Cost cap & rate limit";

  return (
    <AiModalShell title={title} onClose={close}>
      {modal.mode === "deleteHistory" && <DeleteConvoBody kind={modal.kind} id={modal.id} title={modal.title} />}
      {modal.mode === "limits" && <LimitsBody />}
      {modal.mode === "shortcut" && <ShortcutBody />}
    </AiModalShell>
  );
}
