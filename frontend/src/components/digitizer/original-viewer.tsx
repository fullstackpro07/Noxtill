"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDigitizerOriginal } from "@/lib/digitizer-api";
import { DigitizerIcon } from "./digitizer-icon";
import { LoadingBlock } from "./digitizer-ui";

export interface RegionOverlay {
  id: string;
  label: string;
  color: string;
  active: boolean;
  region: { x: number; y: number; w: number; h: number };
  page?: number | null;
  onClick?: () => void;
}

export function useOriginal(docId: string | null) {
  return useQuery({
    queryKey: ["digitizer", "original", docId],
    queryFn: () => fetchDigitizerOriginal(docId!),
    enabled: !!docId,
    // A signed link lives for a day; refetch well before that.
    staleTime: 30 * 60_000,
  });
}

/**
 * The document exactly as it was uploaded. Images can carry region overlays — boxes drawn where
 * the reader says a row sits (an approximation, drawn as such). A PDF is shown as-is, without overlays.
 */
export function OriginalView({
  docId,
  zoom = 1,
  height = 420,
  overlays = [],
  pageFilter,
  footer,
}: {
  docId: string;
  zoom?: number;
  height?: number | string;
  overlays?: RegionOverlay[];
  /** Only overlays on this page are drawn (an image is page 1). */
  pageFilter?: number | null;
  footer?: ReactNode;
}) {
  const { data, isLoading, error } = useOriginal(docId);
  const [broken, setBroken] = useState(false);

  if (isLoading) return <LoadingBlock label="Loading the original…" />;
  if (error || !data) {
    return (
      <div style={{ padding: "26px", textAlign: "center", fontSize: "12.5px", color: "#7A8798" }}>
        <DigitizerIcon name="circle-alert" size={18} style={{ margin: "0 auto 8px", color: "#B42318" }} />
        {error instanceof Error ? error.message : "The original file could not be loaded."}
      </div>
    );
  }

  const isPdf = data.mimeType === "application/pdf";
  const visible = overlays.filter((o) => pageFilter == null || o.page == null || o.page === pageFilter);

  return (
    <div>
      <div className="nx-scroll" style={{ height, overflow: "auto", background: "#F5F6F8" }}>
        {isPdf ? (
          <object data={data.url} type="application/pdf" style={{ width: "100%", height: "100%", minHeight: typeof height === "number" ? height : 420 }}>
            <div style={{ padding: "20px", fontSize: "12.5px", color: "#5B6675" }}>
              This browser cannot show the PDF inline. <a href={data.url} target="_blank" rel="noreferrer" style={{ color: "#15803D", fontWeight: 700 }}>Open the original</a>
            </div>
          </object>
        ) : broken ? (
          <div style={{ padding: "26px", textAlign: "center", fontSize: "12.5px", color: "#7A8798" }}>
            The image could not be displayed. <a href={data.url} target="_blank" rel="noreferrer" style={{ color: "#15803D", fontWeight: 700 }}>Open the original</a>
          </div>
        ) : (
          <div style={{ position: "relative", width: `${zoom * 100}%`, lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.url} alt={data.name} style={{ width: "100%", display: "block" }} onError={() => setBroken(true)} />
            {visible.map((o) => (
              <div key={o.id}>
                <div
                  onClick={o.onClick}
                  title={o.label}
                  style={{
                    position: "absolute",
                    left: `${o.region.x * 100}%`,
                    top: `${o.region.y * 100}%`,
                    width: `${o.region.w * 100}%`,
                    height: `${o.region.h * 100}%`,
                    border: `${o.active ? 2.5 : 1.5}px solid ${o.color}`,
                    borderRadius: "4px",
                    background: `${o.color}1A`,
                    boxShadow: o.active ? `0 0 0 3px ${o.color}33` : "none",
                    cursor: o.onClick ? "pointer" : "default",
                  }}
                />
                {o.active && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${o.region.x * 100}%`,
                      top: `calc(${o.region.y * 100}% - 18px)`,
                      padding: "2px 7px",
                      borderRadius: "5px",
                      background: o.color,
                      color: "#fff",
                      fontSize: "9.5px",
                      fontWeight: 800,
                      lineHeight: "14px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.label}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
