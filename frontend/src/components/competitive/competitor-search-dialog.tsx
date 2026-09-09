"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Star, Loader2 } from "lucide-react";
import { searchCompetitorPlaces, addCompetitorFromPlace, addCompetitor, type PlaceSearchResult } from "@/lib/competitors-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function CompetitorSearchDialog({ open, onClose, atLimit }: { open: boolean; onClose: () => void; atLimit: boolean }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [manualName, setManualName] = useState("");

  const searchMutation = useMutation({
    mutationFn: () => searchCompetitorPlaces(query.trim()),
    onSuccess: (r) => setResults(r),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Search failed — please try again."),
  });

  const addFromPlaceMutation = useMutation({
    mutationFn: (place: PlaceSearchResult) => addCompetitorFromPlace(place),
    onSuccess: (_data, place) => {
      void queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast.success(`${place.name} added to competitor tracking.`);
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this competitor."),
  });

  const addManualMutation = useMutation({
    mutationFn: () => addCompetitor(manualName.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast.success(`${manualName} added to competitor tracking.`);
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this competitor."),
  });

  function handleClose() {
    setQuery("");
    setResults(null);
    setManualName("");
    onClose();
  }

  if (!open) return null;

  return (
    <Dialog open onClose={handleClose} title="Track a competitor" className="max-w-lg">
      {atLimit ? (
        <p className="text-sm text-destructive">You&apos;re tracking the maximum of 5 competitors. Remove one before adding another.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchMutation.mutate())}
              placeholder="Search Google for their business name…"
              className="flex-1"
              autoFocus
            />
            <Button onClick={() => searchMutation.mutate()} disabled={!query.trim() || searchMutation.isPending}>
              {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            </Button>
          </div>

          {results && results.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.placeId}
                  onClick={() => addFromPlaceMutation.mutate(r)}
                  disabled={addFromPlaceMutation.isPending}
                  className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                    {r.address && <p className="truncate text-xs text-fg-faint">{r.address}</p>}
                  </div>
                  {r.rating != null && (
                    <span className="flex shrink-0 items-center gap-0.5 text-xs text-fg-muted">
                      <Star className="h-3 w-3 fill-current" aria-hidden />
                      {r.rating.toFixed(1)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {results && results.length === 0 && (
            <p className="text-xs text-fg-faint">
              No search results — this environment may not have Google Places configured. Add manually below instead.
            </p>
          )}

          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Or add by name (no lookup)</p>
            <div className="flex gap-2">
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Business name" className="flex-1" />
              <Button variant="outline" onClick={() => addManualMutation.mutate()} disabled={!manualName.trim() || addManualMutation.isPending}>
                {addManualMutation.isPending ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
