"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Competitor } from "@/lib/competitors";
import { toast } from "@/lib/toast";

export function AddCompetitorDialog({
  open,
  onClose,
  onAdd,
  atLimit,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (competitor: Competitor) => void;
  atLimit: boolean;
}) {
  const [name, setName] = useState("");

  if (!open) return null;

  function handleAdd() {
    onAdd({
      id: `cp-${Date.now()}`,
      name: name.trim(),
      rating: 4.0,
      reviewCount: 0,
      weeklyRatings: Array(12).fill(4.0),
    });
    toast.success(`${name} added to competitor tracking.`);
    setName("");
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Track a competitor"
      description={atLimit ? undefined : "Search Google Places for a business to track (mocked as a name field here)."}
      footer={
        atLimit ? (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!name.trim()}>
              Add competitor
            </Button>
          </>
        )
      }
    >
      {atLimit ? (
        <p className="text-sm text-destructive">
          You&apos;re tracking the maximum of 5 competitors. Remove one before adding another.
        </p>
      ) : (
        <Input label="Business name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      )}
    </Dialog>
  );
}
