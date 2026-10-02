"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAskDialog, type AskRequest } from "@/lib/ask-dialog";

function AskBody({ request, onDone }: { request: AskRequest; onDone: (value: string | boolean | null) => void }) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const tooShort = request.kind === "text" && trimmed.length < (request.minLength ?? 1);
  return (
    <Dialog
      open
      onClose={() => onDone(null)}
      title={request.title}
      description={request.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(null)}>Cancel</Button>
          <Button
            variant={request.tone === "danger" ? "destructive" : "primary"}
            disabled={tooShort}
            onClick={() => onDone(request.kind === "text" ? trimmed : true)}
          >
            {request.confirmLabel ?? (request.kind === "text" ? "Save" : "Confirm")}
          </Button>
        </>
      }
    >
      {request.kind === "text" && (
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={request.placeholder}
          aria-label={request.title}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
        />
      )}
    </Dialog>
  );
}

/** Mounted once in the app shell; renders whatever `askText` / `askConfirm` requested. */
export function AskDialogHost() {
  const request = useAskDialog((state) => state.request);
  const close = useAskDialog((state) => state.close);
  if (!request) return null;
  return (
    <AskBody
      key={request.title + request.kind}
      request={request}
      onDone={(value) => {
        close();
        request.resolve(value);
      }}
    />
  );
}
