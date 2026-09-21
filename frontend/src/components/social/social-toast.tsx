"use client";

import React from "react";
import { useSocial } from "./social-context";

export function SocialToast() {
  const { toast } = useSocial();

  if (!toast) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 22,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#0A1B2A",
        color: "#fff",
        padding: "11px 18px",
        borderRadius: 11,
        fontSize: 12.5,
        fontWeight: 600,
        boxShadow: "0 14px 34px rgba(10,27,42,.3)",
        zIndex: 98,
        pointerEvents: "none",
        animation: "nxin .17s ease",
      }}
    >
      {toast}
    </div>
  );
}
