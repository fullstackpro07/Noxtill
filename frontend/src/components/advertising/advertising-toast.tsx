"use client";

import React from "react";
import { useAdvertising } from "./advertising-context";

export function AdvertisingToast() {
  const { toast } = useAdvertising();
  if (!toast) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "22px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#0A1B2A",
        color: "#fff",
        padding: "11px 18px",
        borderRadius: "11px",
        fontSize: "12.5px",
        fontWeight: 600,
        boxShadow: "0 14px 34px rgba(10,27,42,.3)",
        zIndex: 98,
        animation: "nxin .15s ease",
      }}
    >
      {toast}
    </div>
  );
}
