"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addCompetitor } from "@/lib/competitors-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function AddCompetitorDialog({
  open,
  onClose,
  atLimit,
}: {
  open: boolean;
  onClose: () => void;
  atLimit: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const addMutation = useMutation({
    mutationFn: () => addCompetitor(name.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast.success(`${name} added to competitor tracking.`);
      setName("");
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add this competitor — please try again.");
    },
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Track a competitor"
      description={atLimit ? undefined : "Their business name, as it appears on Google — used to look up their public rating."}
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
            <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending}>
              {addMutation.isPending ? "Adding…" : "Add competitor"}
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
