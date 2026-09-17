"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileSpreadsheet, RefreshCw, Settings2 } from "lucide-react";
import {
  stageImport,
  getImportBatch,
  confirmImport,
  getImportColumns,
  remapImport,
  type ImportPreview,
} from "@/lib/customer-import-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

type Step = "upload" | "review" | "processing";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "12px 18px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 46 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", minHeight: 46 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 };

export function ImportCustomersPanel({ currency }: { currency: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState<ImportPreview | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [consentAcked, setConsentAcked] = useState(false);
  const [balanceAcked, setBalanceAcked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const stageMutation = useMutation({
    mutationFn: (file: File) => stageImport(file),
    onSuccess: (preview) => {
      setBatch(preview);
      setStep("review");
      setConsentAcked(false);
      setBalanceAcked(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't read this file — please try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmImport(batch!.batchId),
    onSuccess: () => setStep("processing"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't start the import — please try again."),
  });

  const { data: polledBatch } = useQuery({
    queryKey: ["import-batch", batch?.batchId],
    queryFn: () => getImportBatch(batch!.batchId),
    enabled: step === "processing" && !!batch,
    refetchInterval: (query) => (query.state.data?.status === "completed" ? false : 2000),
  });

  const isComplete = polledBatch?.status === "completed";
  const requiresBalanceConfirm = (batch?.counts.totalCredit ?? 0) > 0;
  const canImport =
    consentAcked &&
    (!requiresBalanceConfirm || balanceAcked) &&
    (batch?.counts.create ?? 0) + (batch?.counts.update ?? 0) > 0;

  function reset() {
    setStep("upload");
    setFileName("");
    setBatch(null);
    setMappingOpen(false);
  }

  function handleClose() {
    if (isComplete) queryClient.invalidateQueries({ queryKey: ["customers"] });
    reset();
  }

  function handleFileSelected(file: File) {
    setFileName(file.name);
    stageMutation.mutate(file);
  }

  const steps = [
    { n: 1, label: "Upload", active: step !== "processing" && !batch },
    { n: 2, label: "Review", active: step === "review" },
    { n: 3, label: "Import", active: step === "processing" },
  ];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Import Customers</h2>
      <div className="flex gap-[11px] rounded-[12px] p-[12px_14px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3" }}>
        <span className="text-[12.5px] leading-relaxed" style={{ color: "#93370D" }}>
          Imported contacts are not marked as marketing-consented. They will not receive campaigns until you have their permission.
        </span>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-[9px]">
          {steps.map((s, i) => (
            <span key={s.n} className="flex items-center gap-2">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-extrabold" style={{ background: s.active ? "var(--app-primary)" : "var(--app-surface-2)", color: s.active ? "#fff" : "var(--app-text-muted)" }}>{s.n}</span>
              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{s.label}</span>
              {i < steps.length - 1 && <span className="h-[2px] w-[22px] rounded-[2px]" style={{ background: "var(--app-border)" }} />}
            </span>
          ))}
        </div>
      </div>

      {step === "processing" ? (
        <div className="flex flex-col items-center gap-2 rounded-[16px] py-14 text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          {isComplete ? (
            <>
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[15px]" style={{ background: "#E8F7EE" }}>
                <RefreshCw className="h-[26px] w-[26px]" style={{ color: "var(--app-primary)" }} aria-hidden />
              </div>
              <div className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Import complete</div>
              <div className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{batch?.counts.create} created · {batch?.counts.update} updated</div>
              <button type="button" onClick={handleClose} className="mt-2" style={primaryBtn}>Done</button>
            </>
          ) : (
            <>
              <RefreshCw className="h-9 w-9 animate-spin" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
              <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Importing…</div>
              <div className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>This runs in the background — you can leave this page and check back.</div>
            </>
          )}
        </div>
      ) : step === "upload" || !batch ? (
        <div className="grid gap-[15px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.txt,.docx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }}
          />
          <div className="flex flex-col gap-[11px] rounded-[16px] p-[22px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ background: "#E8F7EE" }}>
              <FileSpreadsheet className="h-[22px] w-[22px]" style={{ color: "var(--app-primary)" }} aria-hidden />
            </span>
            <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Upload CSV, Excel or Word</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Bring your whole list at once. You map the columns yourself — nothing is created until you confirm.</div>
            <div className="mt-auto flex flex-wrap gap-[9px]">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={stageMutation.isPending} style={primaryBtn}>
                {stageMutation.isPending ? "Reading…" : "Choose File"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-[11px] rounded-[16px] p-[22px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ background: "#EEF4FF" }}>
              <Camera className="h-[22px] w-[22px]" style={{ color: "#3538CD" }} aria-hidden />
            </span>
            <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Photograph Your Register</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Snap your paper customer book. It&apos;s parsed the same way a spreadsheet would be — review and confirm before anything is created.</div>
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={stageMutation.isPending} className="mt-auto self-start" style={outlineBtn}>
              Take / Select Photo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[15px]">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{fileName}</span>
            </div>
            <div className="flex items-center gap-2">
              {batch.hasColumnMapping && (
                <button type="button" onClick={() => setMappingOpen(true)} style={{ ...outlineBtn, padding: "9px 13px", minHeight: 42 }}>
                  <Settings2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />Fix column mapping
                </button>
              )}
              <button type="button" onClick={reset} className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Start over</button>
            </div>
          </div>

          {mappingOpen && (
            <ColumnMappingCard
              batchId={batch.batchId}
              onApplied={(updated) => { setBatch(updated); setMappingOpen(false); }}
              onCancel={() => setMappingOpen(false)}
            />
          )}

          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <span className="rounded-full px-[10px] py-1 text-[11.5px] font-extrabold" style={{ background: "#E8F7EE", color: "#0E8442" }}>{batch.counts.create} new</span>
              {batch.counts.update > 0 && <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{batch.counts.update} updated</span>}
              {batch.counts.skip > 0 && <span className="rounded-full px-[10px] py-1 text-[11.5px] font-extrabold" style={{ background: "#FEF3F2", color: "#B42318" }}>{batch.counts.skip} skipped</span>}
              {batch.counts.totalCredit > 0 && <span className="ml-auto text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(batch.counts.totalCredit, currency)} opening credit</span>}
            </div>

            {batch.preview.length > 0 && (
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "var(--app-surface-2)" }}>
                      <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Row</th>
                      <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Name</th>
                      <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                      <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Opening Credit</th>
                      <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.preview.map((row) => (
                      <tr key={row.rowNumber} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td className="p-[11px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{row.rowNumber}</td>
                        <td className="p-[11px] text-[12.5px] font-semibold" style={{ color: "var(--app-text)" }}>{row.name}</td>
                        <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{row.normalizedPhone ?? row.rawPhone}</td>
                        <td className="p-[11px] text-end text-[12.5px] font-extrabold" style={{ color: row.balance ? "#B42318" : "var(--app-text-disabled)" }}>{row.balance ? formatCurrency(row.balance, currency) : "—"}</td>
                        <td className="p-[11px_17px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: row.action === "create" ? "#E8F7EE" : "var(--app-surface-2)", color: row.action === "create" ? "#0E8442" : "var(--app-text-muted)" }}>{row.action}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {batch.invalid.length > 0 && (
            <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
              <div className="p-[13px_17px]" style={{ borderBottom: "1px solid #FDD9D6", background: "#FFFBFA" }}>
                <h3 className="m-0 text-[14px] font-extrabold" style={{ color: "#B42318" }}>Rows needing attention</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 500 }}>
                  <tbody>
                    {batch.invalid.map((row) => (
                      <tr key={row.rowNumber} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td className="p-[11px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Row {row.rowNumber}</td>
                        <td className="p-[11px_17px] text-[12.5px]" style={{ color: "#B42318" }}>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-[9px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <label className="flex items-start gap-[9px] text-[12.5px]" style={{ color: "var(--app-text)" }}>
              <input type="checkbox" checked={consentAcked} onChange={(e) => setConsentAcked(e.target.checked)} className="mt-0.5" style={{ accentColor: "var(--app-primary)" }} />
              I understand imported customers have <strong className="mx-1">not</strong> opted in to marketing messages — they can only be reached with transactional/utility messages until they consent themselves.
            </label>
            {requiresBalanceConfirm && (
              <label className="flex items-start gap-[9px] text-[12.5px]" style={{ color: "var(--app-text)" }}>
                <input type="checkbox" checked={balanceAcked} onChange={(e) => setBalanceAcked(e.target.checked)} className="mt-0.5" style={{ accentColor: "var(--app-primary)" }} />
                I confirm the {formatCurrency(batch.counts.totalCredit, currency)} in opening balances above is accurate and should be recorded as real credit owed.
              </label>
            )}
          </div>

          <div className="flex justify-end gap-[10px]">
            <button type="button" onClick={reset} disabled={confirmMutation.isPending} style={outlineBtn}>Cancel</button>
            <button type="button" onClick={() => confirmMutation.mutate()} disabled={!canImport || confirmMutation.isPending} style={primaryBtn}>
              {confirmMutation.isPending ? "Starting…" : `Import ${batch.counts.create + batch.counts.update} customers`}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ColumnMappingCard({
  batchId,
  onApplied,
  onCancel,
}: {
  batchId: string;
  onApplied: (batch: ImportPreview) => void;
  onCancel: () => void;
}) {
  const { data: columns, isPending } = useQuery({ queryKey: ["import-columns", batchId], queryFn: () => getImportColumns(batchId) });
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);

  const effectiveMapping = mapping ?? columns?.mapping ?? {};

  const remapMutation = useMutation({
    mutationFn: () => remapImport(batchId, effectiveMapping),
    onSuccess: (updated) => {
      toast.success("Mapping applied.");
      onApplied(updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this mapping."),
  });

  return (
    <div className="flex flex-col gap-[14px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <p className="m-0 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>Map each column from your file to a customer field</p>
      {isPending || !columns ? (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading columns…</p>
      ) : (
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {columns.headers.map((header) => (
            <div key={header} className="flex flex-col gap-1">
              <span className="truncate text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{header}</span>
              <select value={effectiveMapping[header] ?? "ignore"} onChange={(e) => setMapping({ ...effectiveMapping, [header]: e.target.value })} aria-label={`Map column "${header}"`} style={selectStyle}>
                <option value="ignore">Ignore this column</option>
                <option value="name">Name</option>
                <option value="phone">Phone</option>
                <option value="balance">Opening balance</option>
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Cancel</button>
        <button type="button" onClick={() => remapMutation.mutate()} disabled={!columns || remapMutation.isPending} style={{ ...primaryBtn, padding: "9px 16px", minHeight: 42 }}>
          {remapMutation.isPending ? "Applying…" : "Apply mapping"}
        </button>
      </div>
    </div>
  );
}
