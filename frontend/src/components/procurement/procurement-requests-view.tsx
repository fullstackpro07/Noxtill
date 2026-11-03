"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  Plus,
  X,
} from "lucide-react";
import {
  convertProcurementRequest,
  createProcurementRequest,
  fetchProcurementRequests,
  submitProcurementRequest,
  updateProcurementRequest,
  withdrawProcurementRequest,
  sourceProcurementRequest,
  type ProcurementRequest,
  type ProcurementRequestInput,
} from "@/lib/procurement-api";
import { fetchInventory } from "@/lib/inventory-api";
import { fetchSuppliers } from "@/lib/suppliers-api";
import { useSession } from "@/lib/session";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { formatDate } from "@/lib/format";
import { askConfirm } from "@/lib/ask-dialog";

function formatRequestCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

type DraftLine = {
  lineType: ProcurementRequestInput["items"][number]["lineType"];
  productId: string;
  description: string;
  category: string;
  quantity: string;
  estimatedUnitCost: string;
};

const EMPTY_LINE: DraftLine = {
  lineType: "stock",
  productId: "",
  description: "",
  category: "",
  quantity: "1",
  estimatedUnitCost: "",
};

const STATUS_TONE: Record<string, string> = {
  draft:
    "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]",
  submitted: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-800",
  sourcing: "border-violet-300 bg-violet-50 text-violet-800",
  rejected: "border-rose-300 bg-rose-50 text-rose-800",
  converted: "border-blue-300 bg-blue-50 text-blue-800",
  cancelled:
    "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]",
};

function emptyInput(currency: string): ProcurementRequestInput {
  return {
    reason: "",
    urgency: "normal",
    currency,
    items: [],
  };
}

function sourcingUnavailableReason(
  request: Pick<ProcurementRequest, "currency" | "items">,
  businessCurrency: string,
) {
  if (
    request.items.length === 0 ||
    request.items.some(
      (item) =>
        item.lineType !== "stock" ||
        !item.productId ||
        !Number.isInteger(item.quantity),
    )
  ) {
    return "Shared supplier RFQs currently need catalog-linked stock lines with whole-unit quantities.";
  }
  if (request.currency.toUpperCase() !== businessCurrency.toUpperCase()) {
    return `RFQ awards can create Inventory purchase orders only in ${businessCurrency}; no currency conversion is configured.`;
  }
  return null;
}

export function ProcurementRequestsView() {
  const router = useRouter();
  const session = useSession();
  const queryClient = useQueryClient();
  const canDecide =
    session.user.role === "owner" || session.user.role === "manager";
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [department, setDepartment] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [budgetCode, setBudgetCode] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [urgency, setUrgency] =
    useState<ProcurementRequestInput["urgency"]>("normal");
  const [supplierId, setSupplierId] = useState("");
  const [branchBusinessId, setBranchBusinessId] = useState("");
  const [attachmentText, setAttachmentText] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<{
    id: string;
    version: number;
  } | null>(null);

  useModuleHeader({
    title: "Purchase requests",
    subtitle: "Capture demand before it becomes a purchase order",
  });

  const requestsQuery = useInfiniteQuery({
    queryKey: ["procurement", "requests"],
    queryFn: ({ pageParam }) => fetchProcurementRequests(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.hasMore ? (page.nextCursor ?? undefined) : undefined,
  });
  const productsQuery = useQuery({
    queryKey: ["procurement", "request-products"],
    queryFn: fetchInventory,
    enabled: formOpen,
  });
  const suppliersQuery = useQuery({
    queryKey: ["procurement", "request-suppliers"],
    queryFn: fetchSuppliers,
    enabled: formOpen,
  });

  const refreshRequests = () =>
    queryClient.invalidateQueries({ queryKey: ["procurement", "requests"] });
  const createMutation = useMutation({
    mutationFn: createProcurementRequest,
    onSuccess: refreshRequests,
  });
  const submitMutation = useMutation({
    mutationFn: submitProcurementRequest,
    onSuccess: refreshRequests,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      version,
      input,
    }: {
      id: string;
      version: number;
      input: ProcurementRequestInput;
    }) => updateProcurementRequest(id, version, input),
    onSuccess: refreshRequests,
  });
  const withdrawMutation = useMutation({
    mutationFn: withdrawProcurementRequest,
    onSuccess: refreshRequests,
  });
  const conversionMutation = useMutation({
    mutationFn: convertProcurementRequest,
    onSuccess: refreshRequests,
  });
  const sourcingMutation = useMutation({
    mutationFn: sourceProcurementRequest,
    onSuccess: async (rfq) => {
      await refreshRequests();
      router.push(
        `/autonomous-commerce/rfqs?rfqId=${encodeURIComponent(rfq.id)}`,
      );
    },
  });

  const requests = useMemo(
    () => requestsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [requestsQuery.data],
  );
  const busy =
    createMutation.isPending ||
    submitMutation.isPending ||
    updateMutation.isPending ||
    withdrawMutation.isPending ||
    conversionMutation.isPending;
  const sourcingBusy = busy || sourcingMutation.isPending;

  function resetForm() {
    setEditingDraft(null);
    setReason("");
    setDepartment("");
    setCostCenter("");
    setBudgetCode("");
    setNeededBy("");
    setUrgency("normal");
    setSupplierId("");
    setBranchBusinessId("");
    setAttachmentText("");
    setLines([{ ...EMPTY_LINE }]);
    setFormError(null);
    setFormOpen(false);
  }

  async function saveRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const submitAfterSave =
      (event.nativeEvent as SubmitEvent).submitter instanceof
        HTMLButtonElement &&
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
        "submit";
    const items = lines.map((line) => ({
      lineType: line.lineType,
      ...(line.productId ? { productId: line.productId } : {}),
      description: line.description.trim(),
      ...(line.category.trim() ? { category: line.category.trim() } : {}),
      quantity: Number(line.quantity),
      estimatedUnitCost: Number(line.estimatedUnitCost),
    }));
    const invalidLine = items.some(
      (item) =>
        !item.description ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.estimatedUnitCost) ||
        item.estimatedUnitCost < 0,
    );
    if (!reason.trim() || invalidLine) {
      setFormError(
        "Add a reason and complete each line with a description and valid estimate.",
      );
      return;
    }

    const input: ProcurementRequestInput = {
      ...emptyInput(session.business.currency),
      reason: reason.trim(),
      urgency,
      items,
      ...(department.trim() ? { department: department.trim() } : {}),
      ...(costCenter.trim() ? { costCenter: costCenter.trim() } : {}),
      ...(budgetCode.trim() ? { budgetCode: budgetCode.trim() } : {}),
      ...(neededBy
        ? { neededBy: new Date(`${neededBy}T12:00:00`).toISOString() }
        : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(branchBusinessId ? { branchBusinessId } : {}),
      ...(attachmentText.trim()
        ? {
            attachmentUrls: attachmentText
              .split(/\r?\n/)
              .map((url) => url.trim())
              .filter(Boolean),
          }
        : {}),
    };

    let saved: ProcurementRequest | null = null;
    try {
      saved = editingDraft
        ? await updateMutation.mutateAsync({
            id: editingDraft.id,
            version: editingDraft.version,
            input,
          })
        : await createMutation.mutateAsync(input);
      if (submitAfterSave) await submitMutation.mutateAsync(saved.id);
      resetForm();
    } catch (error) {
      if (saved?.status === "draft") {
        setEditingDraft({ id: saved.id, version: saved.version });
      }
      setFormError(
        error instanceof Error
          ? error.message
          : "The request could not be submitted. Check whether a draft was saved and try again.",
      );
      await refreshRequests();
    }
  }

  function openDraftForEditing(request: ProcurementRequest) {
    setEditingDraft({ id: request.id, version: request.version });
    setReason(request.reason);
    setDepartment(request.department ?? "");
    setCostCenter(request.costCenter ?? "");
    setBudgetCode(request.budgetCode ?? "");
    setNeededBy(
      request.neededBy
        ? new Date(request.neededBy).toISOString().slice(0, 10)
        : "",
    );
    setUrgency(request.urgency);
    setSupplierId(request.supplier?.id ?? "");
    setBranchBusinessId(request.branch?.id ?? "");
    setAttachmentText(request.attachmentUrls.join("\n"));
    setLines(
      request.items.map((item) => ({
        lineType: item.lineType,
        productId: item.productId ?? "",
        description: item.description,
        category: item.category ?? "",
        quantity: String(item.quantity),
        estimatedUnitCost: String(item.estimatedUnitCost),
      })),
    );
    setFormError(null);
    setFormOpen(true);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
            Procurement
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
            Purchase requests
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--app-text-muted)]">
            Staff can record a need here before any purchase commitment is made.
            Managers approve or reject submitted requests in the Action Center;
            requests do not change stock, create a payable, or send anything to
            a supplier.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setFormOpen((open) => !open);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {formOpen ? (
            <X className="h-4 w-4" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {formOpen ? "Close" : "New request"}
        </button>
      </header>

      {formOpen && (
        <form
          onSubmit={saveRequest}
          className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm"
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--app-text)]">
                {editingDraft ? "Edit purchase request" : "Request details"}
              </h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Estimate is recorded in the selected currency; no FX conversion
                is applied.
              </p>
            </div>
            <span className="rounded-full border border-[var(--app-border)] px-3 py-1 text-xs font-medium text-[var(--app-text-muted)]">
              {editingDraft
                ? `Editing draft v${editingDraft.version}`
                : "Draft → submit for approval"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Reason
              <input
                required
                maxLength={4000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Department
              <input
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                maxLength={191}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Cost center
              <input
                value={costCenter}
                onChange={(event) => setCostCenter(event.target.value)}
                maxLength={191}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Budget code
              <input
                value={budgetCode}
                onChange={(event) => setBudgetCode(event.target.value)}
                maxLength={191}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Needed by
              <input
                type="date"
                value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Urgency
              <select
                value={urgency}
                onChange={(event) =>
                  setUrgency(
                    event.target.value as ProcurementRequestInput["urgency"],
                  )
                }
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Branch
              <select
                value={branchBusinessId}
                onChange={(event) => setBranchBusinessId(event.target.value)}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              >
                <option value="">Business-wide</option>
                {session.business.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--app-text-muted)]">
              Suggested supplier
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              >
                <option value="">No supplier selected</option>
                {(suppliersQuery.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[var(--app-text)]">
                  Request lines
                </h3>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  Only stock lines linked to a real product can later convert to
                  an inventory purchase order.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLines((current) => [...current, { ...EMPTY_LINE }])
                }
                className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
              >
                Add line
              </button>
            </div>
            <div className="grid gap-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-[var(--app-border)] p-3 md:grid-cols-2 xl:grid-cols-[140px_minmax(180px,1fr)_minmax(180px,1fr)_110px_140px_auto]"
                >
                  <label className="grid gap-1 text-xs text-[var(--app-text-muted)]">
                    Type
                    <select
                      value={line.lineType}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  lineType: event.target
                                    .value as DraftLine["lineType"],
                                  productId: "",
                                }
                              : item,
                          ),
                        )
                      }
                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--app-text)]"
                    >
                      <option value="stock">Stock</option>
                      <option value="service">Service</option>
                      <option value="asset">Asset</option>
                      <option value="expense">Expense</option>
                    </select>
                  </label>
                  {line.lineType === "stock" ? (
                    <label className="grid gap-1 text-xs text-[var(--app-text-muted)]">
                      Link product
                      <select
                        value={line.productId}
                        onChange={(event) => {
                          const product = productsQuery.data?.find(
                            (item) => item.id === event.target.value,
                          );
                          setLines((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    productId: product?.id ?? "",
                                    description:
                                      product?.name ?? item.description,
                                    category:
                                      product?.category ?? item.category,
                                    estimatedUnitCost: product
                                      ? String(product.costPrice)
                                      : item.estimatedUnitCost,
                                  }
                                : item,
                            ),
                          );
                        }}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--app-text)]"
                      >
                        <option value="">Unlinked line</option>
                        {(productsQuery.data ?? []).map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="hidden xl:block" />
                  )}
                  <label className="grid gap-1 text-xs text-[var(--app-text-muted)]">
                    Description
                    <input
                      required
                      maxLength={1000}
                      value={line.description}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--app-text)]"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--app-text-muted)]">
                    Category
                    <input
                      value={line.category}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, category: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--app-text)]"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--app-text-muted)]">
                    Quantity
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, quantity: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--app-text)]"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-[var(--app-text-muted)]">
                    Est. unit cost ({session.business.currency})
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={line.estimatedUnitCost}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  estimatedUnitCost: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--app-text)]"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove request line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    className="self-end rounded-md border border-[var(--app-border)] p-2 text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)] disabled:opacity-40"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <label className="mt-5 grid gap-1.5 text-sm text-[var(--app-text-muted)]">
            Quote or document links{" "}
            <span className="text-xs">
              One URL per line. File upload is not configured.
            </span>
            <textarea
              rows={2}
              value={attachmentText}
              onChange={(event) => setAttachmentText(event.target.value)}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)]"
              placeholder="https://…"
            />
          </label>
          {formError && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-3 text-sm text-[var(--app-danger)]"
            >
              {formError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-[var(--app-border)] px-4 py-2 text-sm font-semibold text-[var(--app-text)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              name="intent"
              value="draft"
              disabled={busy}
              className="rounded-lg border border-[var(--app-border)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button
              type="submit"
              name="intent"
              value="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden />
              {busy ? "Saving…" : "Save & submit"}
            </button>
          </div>
        </form>
      )}

      {requestsQuery.isPending ? (
        <div className="grid gap-3" aria-label="Loading purchase requests">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-36 animate-pulse rounded-xl bg-[var(--app-surface-muted)]"
            />
          ))}
        </div>
      ) : requestsQuery.isError ? (
        <section
          role="alert"
          className="rounded-xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-5 text-sm text-[var(--app-danger)]"
        >
          Could not load purchase requests. {requestsQuery.error.message}
        </section>
      ) : requests.length === 0 ? (
        <section className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] p-10 text-center">
          <h2 className="text-lg font-semibold text-[var(--app-text)]">
            No purchase requests yet
          </h2>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            Requests appear here after a staff member records a business need.
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="mt-4 rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Create first request
          </button>
        </section>
      ) : (
        <section className="grid gap-4" aria-label="Purchase requests">
          {requests.map((request) => {
            const sourcingReason = sourcingUnavailableReason(
              request,
              session.business.currency,
            );
            const activeSourceRfq = request.sourceRfqs.find(
              (rfq) => rfq.status === "draft" || rfq.status === "open",
            );
            return (
              <article
                key={request.id}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[var(--app-text)]">
                        {request.reason}
                      </h2>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_TONE[request.status] ?? STATUS_TONE.draft}`}
                      >
                        {request.status}
                      </span>
                      <span className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-xs capitalize text-[var(--app-text-muted)]">
                        {request.urgency} urgency
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                      Requested by {request.requester.name}
                      {request.department ? ` · ${request.department}` : ""}
                      {request.branch ? ` · ${request.branch.name}` : ""} ·{" "}
                      {formatDate(request.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                      {request.items.length} line
                      {request.items.length === 1 ? "" : "s"} ·{" "}
                      {request.supplier?.name ?? "No supplier selected"}
                      {request.neededBy
                        ? ` · Needed by ${formatDate(request.neededBy)}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--app-text-muted)]">
                      Estimate · {request.currency}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--app-text)]">
                      {formatRequestCurrency(
                        request.totalEstimate,
                        request.currency,
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--app-border)]">
                  <table className="w-full min-w-[580px] text-left text-sm">
                    <thead className="bg-[var(--app-surface-muted)] text-xs uppercase text-[var(--app-text-muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Line</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Estimate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {request.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-[var(--app-text)]">
                            {item.productName ?? item.description}
                            {item.category ? (
                              <span className="ml-2 text-xs text-[var(--app-text-faint)]">
                                {item.category}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 capitalize text-[var(--app-text-muted)]">
                            {item.lineType}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[var(--app-text-muted)]">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[var(--app-text-muted)]">
                            {formatRequestCurrency(
                              item.estimatedLineTotal,
                              request.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {request.decisionReason && (
                  <p className="mt-3 rounded-lg bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-text-muted)]">
                    Decision note: {request.decisionReason}
                  </p>
                )}
                {request.attachmentUrls.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {request.attachmentUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)] hover:underline"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        Document link
                      </a>
                    ))}
                  </div>
                )}
                <details className="mt-4 group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--app-text-muted)]">
                    Approval history{" "}
                    <ChevronDown
                      className="h-4 w-4 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <ol className="mt-3 grid gap-2 border-l border-[var(--app-border)] pl-4">
                    {request.events.map((event) => (
                      <li
                        key={event.id}
                        className="text-xs text-[var(--app-text-muted)]"
                      >
                        <span className="font-semibold capitalize text-[var(--app-text)]">
                          {event.type}
                        </span>
                        {event.actor ? ` · ${event.actor.name}` : ""}
                        {event.reason ? ` · ${event.reason}` : ""} ·{" "}
                        {formatDate(event.createdAt)}
                      </li>
                    ))}
                  </ol>
                </details>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {request.status === "draft" &&
                    (request.requester.id === session.user.id || canDecide) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openDraftForEditing(request)}
                        className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
                      >
                        Edit draft
                      </button>
                    )}
                  {request.status === "draft" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void submitMutation.mutateAsync(request.id)
                      }
                      className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
                    >
                      Submit
                    </button>
                  )}
                  {request.status === "submitted" &&
                    (canDecide ? (
                      <Link
                        href="/dashboard/actions"
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)]"
                      >
                        Review in Action Center{" "}
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : (
                      <span className="self-center text-sm text-[var(--app-text-muted)]">
                        Awaiting approval in Action Center
                      </span>
                    ))}
                  {request.status === "submitted" &&
                    (request.requester.id === session.user.id || canDecide) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await askConfirm({
                              title: "Withdraw this purchase request?",
                              description:
                                "It will be removed from the pending approval queue and kept in the request history.",
                              tone: "danger",
                              confirmLabel: "Withdraw",
                            })
                          )
                            await withdrawMutation.mutateAsync(request.id);
                        }}
                        className="rounded-lg border border-[var(--app-danger-border)] px-3 py-2 text-sm font-semibold text-[var(--app-danger)] disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    )}
                  {canDecide && request.status === "approved" && (
                    <>
                      <button
                        type="button"
                        disabled={sourcingBusy || !!sourcingReason}
                        title={sourcingReason ?? undefined}
                        onClick={() =>
                          void sourcingMutation.mutateAsync(request.id)
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
                      >
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                        Send to sourcing
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void conversionMutation.mutateAsync(request.id)
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <ArrowDownToLine className="h-4 w-4" aria-hidden />
                        Convert to purchase order
                      </button>
                      {sourcingReason && (
                        <span className="self-center text-xs text-[var(--app-text-muted)]">
                          {sourcingReason}
                        </span>
                      )}
                    </>
                  )}
                  {canDecide &&
                    request.status === "sourcing" &&
                    activeSourceRfq && (
                      <Link
                        href={`/autonomous-commerce/rfqs?rfqId=${encodeURIComponent(activeSourceRfq.id)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)]"
                      >
                        Open sourcing RFQ{" "}
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </Link>
                    )}
                  {request.convertedPurchaseOrder && (
                    <Link
                      href="/inventory/purchases"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)]"
                    >
                      Open purchase orders{" "}
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
      {requestsQuery.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={requestsQuery.isFetchingNextPage}
            onClick={() => void requestsQuery.fetchNextPage()}
            className="rounded-lg border border-[var(--app-border)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
          >
            {requestsQuery.isFetchingNextPage
              ? "Loading…"
              : "Load more requests"}
          </button>
        </div>
      )}
      {(conversionMutation.isError ||
        submitMutation.isError ||
        updateMutation.isError ||
        withdrawMutation.isError ||
        sourcingMutation.isError) && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-3 text-sm text-[var(--app-danger)]"
        >
          {
            (
              sourcingMutation.error ??
              withdrawMutation.error ??
              updateMutation.error ??
              conversionMutation.error ??
              submitMutation.error
            )?.message
          }
        </p>
      )}
    </main>
  );
}
