"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDigitizerOverview,
  uploadDigitizerDocument,
  type DigitizerScannerType,
  type DocumentDetail,
  type OverviewResponse,
} from "@/lib/digitizer-api";
import { useDigitizerStore } from "./digitizer-store";
import { plural } from "./digitizer-ui";

export const DIGITIZER_KEY = "digitizer";

interface UploadInput {
  files: File[];
  scannerType: DigitizerScannerType;
}

interface UploadOutcome {
  documents: (DocumentDetail & { reused: boolean })[];
  failed: { name: string; message: string }[];
  groupId: string;
}

interface DigitizerDataContextType {
  overview: OverviewResponse | undefined;
  isLoading: boolean;
  error: unknown;
  /** Uploads every file (one document each, tied together by a shared batch id). */
  upload: (input: UploadInput) => Promise<UploadOutcome>;
  uploading: boolean;
  /** Refresh every Digitizer query — call after anything that changes a document. */
  refresh: () => void;
}

const DigitizerDataContext = createContext<DigitizerDataContextType | null>(null);

/** How fast the overview polls: quickly while documents are being read, lazily otherwise. */
const BUSY_POLL_MS = 3000;
const IDLE_POLL_MS = 30_000;

export function DigitizerDataProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const notify = useDigitizerStore((s) => s.notify);
  const notifyError = useDigitizerStore((s) => s.notifyError);
  const [uploading, setUploading] = useState(false);

  const { data: overview, isLoading, error } = useQuery({
    queryKey: [DIGITIZER_KEY, "overview"],
    queryFn: fetchDigitizerOverview,
    refetchInterval: (q) => {
      const k = q.state.data?.kpis;
      return k && k.processing + k.queued > 0 ? BUSY_POLL_MS : IDLE_POLL_MS;
    },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [DIGITIZER_KEY] });
  }, [queryClient]);

  const uploadMutation = useMutation({
    mutationFn: async ({ files, scannerType }: UploadInput): Promise<UploadOutcome> => {
      const groupId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `grp-${Date.now()}`;
      const documents: UploadOutcome["documents"] = [];
      const failed: UploadOutcome["failed"] = [];
      // Two at a time: quick enough for a stack of pages, gentle on the server.
      const queue = [...files];
      const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          try {
            documents.push(await uploadDigitizerDocument(file, scannerType, groupId));
          } catch (e) {
            failed.push({ name: file.name, message: e instanceof Error ? e.message : "Upload failed" });
          }
        }
      };
      await Promise.all([worker(), worker()]);
      return { documents, failed, groupId };
    },
    onMutate: () => setUploading(true),
    onSettled: () => {
      setUploading(false);
      refresh();
    },
    onSuccess: ({ documents, failed }) => {
      const fresh = documents.filter((d) => !d.reused).length;
      const reused = documents.length - fresh;
      if (fresh) notify(`${plural(fresh, "document")} uploaded`, "Reading has started — follow it in the Processing Queue.");
      else if (reused) notify("Already scanned", "That file was uploaded before — showing the existing document.");
      if (failed.length) notifyError(`${plural(failed.length, "file")} not uploaded`, failed.map((f) => `${f.name}: ${f.message}`).join(" · "));
    },
    onError: (e: unknown) => notifyError("Upload failed", e instanceof Error ? e.message : "Please try again."),
  });

  const upload = useCallback((input: UploadInput) => uploadMutation.mutateAsync(input), [uploadMutation]);

  const value = useMemo<DigitizerDataContextType>(
    () => ({ overview, isLoading, error, upload, uploading, refresh }),
    [overview, isLoading, error, upload, uploading, refresh],
  );

  return <DigitizerDataContext.Provider value={value}>{children}</DigitizerDataContext.Provider>;
}

export function useDigitizerData() {
  const ctx = useContext(DigitizerDataContext);
  if (!ctx) throw new Error("useDigitizerData must be used inside DigitizerDataProvider");
  return ctx;
}

/** Poll interval for a screen that lists documents: fast while any is still being read. */
export function busyInterval(processing: number): number {
  return processing > 0 ? BUSY_POLL_MS : IDLE_POLL_MS;
}
