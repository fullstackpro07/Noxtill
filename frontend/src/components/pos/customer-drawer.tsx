"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { searchCustomers, createCustomer, fetchDebtors, type CustomerSearchResult } from "@/lib/customers-api";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export interface PosCustomer {
  id: string;
  name: string;
  phone: string;
  creditBalance: number;
}

/** Real customer lookup + create — matches the design's two-mode drawer (search, then create)
 * exactly, using the real POST /customers endpoint for creation (not deferred to sale time). */
export function CustomerDrawer({
  open,
  onClose,
  currency,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  currency: string;
  onPick: (customer: PosCustomer) => void;
}) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [createError, setCreateError] = useState(false);
  const queryClient = useQueryClient();

  const { data: results = [] } = useQuery({
    queryKey: ["customer-search", "drawer", query],
    queryFn: () => searchCustomers(query),
    enabled: open && query.trim().length > 0,
  });
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors"], queryFn: fetchDebtors, staleTime: 30_000 });

  const createMutation = useMutation({
    mutationFn: () => createCustomer({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, notes: notes.trim() || undefined }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customer-search"] });
      toast.success("Customer created.");
      reset();
      onPick({ id: customer.id, name: customer.name, phone: customer.phone, creditBalance: 0 });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this customer — please try again."),
  });

  function reset() {
    setMode("search");
    setQuery("");
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setCreateError(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pick(c: CustomerSearchResult) {
    const balance = debtors.find((d) => d.customerId === c.id)?.balance ?? 0;
    onPick({ id: c.id, name: c.name, phone: c.phone, creditBalance: balance });
    reset();
    onClose();
  }

  function handleCreate() {
    if (!name.trim() || !phone.trim()) {
      setCreateError(true);
      return;
    }
    setCreateError(false);
    createMutation.mutate();
  }

  function initials(n: string): string {
    return n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <SlideDrawer open={open} onClose={handleClose} title={mode === "search" ? "Choose Customer" : "Create Customer"}>
      {mode === "search" ? (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3.5" style={{ color: "var(--app-text-disabled)" }} width={17} height={17} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Phone number or name"
              aria-label="Search customers"
              autoFocus
              className="w-full rounded-[12px] py-[13px] ps-[42px] pe-[13px] text-[14px]"
              style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
            />
          </div>
          {results.length > 0 && (
            <>
              <div className="text-[11px] font-bold tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>MATCHES</div>
              {results.map((c) => {
                const balance = debtors.find((d) => d.customerId === c.id)?.balance ?? 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-[12px] p-[13px] text-start"
                    style={{ border: "1px solid var(--app-border)" }}
                  >
                    <span
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12px] font-extrabold"
                      style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}
                    >
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{c.name}</span>
                      <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
                    </span>
                    <span className="text-[11.5px] font-bold" style={{ color: balance > 0 ? "var(--app-danger-strong)" : "var(--app-success-text)" }}>
                      {balance > 0 ? `Owes ${formatCurrency(balance, currency)}` : "No balance"}
                    </span>
                  </button>
                );
              })}
            </>
          )}
          {query.trim().length > 0 && results.length === 0 && (
            <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>No customer matches that phone or name.</p>
          )}
          <button
            onClick={() => setMode("create")}
            className="flex min-h-12 items-center justify-center rounded-[12px] p-[13px] text-[12.5px] font-bold"
            style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary-hover, #0E8442)" }}
          >
            + Create Customer
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NAME</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              className="w-full rounded-[11px] p-3 text-[13.5px]"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PHONE</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03xx xxxxxxx"
              className="w-full rounded-[11px] p-3 text-[13.5px]"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>EMAIL (OPTIONAL)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-[11px] p-3 text-[13.5px]"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NOTES (OPTIONAL)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering"
              className="w-full rounded-[11px] p-3 text-[13.5px]"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
          {createError && (
            <div role="alert" className="rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", color: "var(--app-danger-strong)" }}>
              Name and phone are both required.
            </div>
          )}
          <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Your cart stays exactly as it is — creating a customer never clears the sale.</p>
          <div className="flex gap-2.5">
            <button
              onClick={() => setMode("search")}
              className="flex-1 rounded-[11px] p-3 text-[12.5px] font-semibold"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex-[1.4] rounded-[11px] p-3 text-[12.5px] font-extrabold text-white disabled:opacity-60"
              style={{ background: "var(--app-primary)" }}
            >
              {createMutation.isPending ? "Creating…" : "Create & Select"}
            </button>
          </div>
        </div>
      )}
    </SlideDrawer>
  );
}
