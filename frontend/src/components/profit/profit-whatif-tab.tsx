"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldAlert, Sparkles } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/error-states";
import { fetchProducts } from "@/lib/products-api";
import { whatIf } from "@/lib/profit-api";
import { ApiError } from "@/lib/api-client";

export function ProfitWhatifTab({ initialProductId }: { initialProductId?: string } = {}) {
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [priceChangePercent, setPriceChangePercent] = useState(0);

  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  const mutation = useMutation({
    mutationFn: () => whatIf(productId, priceChangePercent),
  });

  const selected = products.find((p) => p.id === productId);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <Select
          label="Product"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            mutation.reset();
          }}
          className="mb-4"
        >
          <option value="">Select a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="price-slider" className="text-sm font-medium text-fg">
            Price change
          </label>
          <span className="font-display text-lg font-bold text-fg">
            {priceChangePercent > 0 ? "+" : ""}
            {priceChangePercent}%
          </span>
        </div>
        <input
          id="price-slider"
          type="range"
          min={-20}
          max={20}
          step={1}
          value={priceChangePercent}
          onChange={(e) => {
            setPriceChangePercent(Number(e.target.value));
            mutation.reset();
          }}
          className="w-full accent-primary"
        />

        <Button
          className="mt-4 w-full"
          disabled={!productId || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {mutation.isPending ? "Thinking…" : "Get AI estimate"}
        </Button>

        {mutation.isError && (
          <div className="mt-4">
            <InlineError
              message={
                mutation.error instanceof ApiError
                  ? mutation.error.message
                  : "Couldn't get an estimate — please try again."
              }
            />
          </div>
        )}

        {mutation.data && (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-2 p-3.5 text-sm text-fg">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-faint">
              {selected?.name} · {priceChangePercent > 0 ? "+" : ""}
              {priceChangePercent}%
            </p>
            {mutation.data.estimate}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-3.5 py-3 text-xs text-fg-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
        {mutation.data?.disclaimer ??
          "This is a simulated estimate assuming unchanged demand — it does not account for customers lost or gained by a price change. Not financial advice; always confirm with your own numbers before acting on it."}
      </div>
    </div>
  );
}
