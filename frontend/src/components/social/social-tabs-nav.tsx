"use client";

import React from "react";
import Link from "next/link";
import { useSocial, TAB_DEFS } from "./social-context";

export function SocialTabsNav() {
  const { activeScreen, posts, comments } = useSocial();

  const needsApprovalCount = posts.filter((p) => p.st === "Needs approval").length;
  const unansweredCount = comments.filter((c) => c.st === "New" || c.st === "AI suggested").length;

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid #E6EAF0",
        padding: "0 22px",
        display: "flex",
        gap: 2,
        overflowX: "auto",
        position: "sticky",
        top: 0,
        zIndex: 25,
      }}
    >
      {TAB_DEFS.map(([k, label, iconPath, route]) => {
        const isActive = activeScreen === k;
        let badge = "";
        if (k === "content" && needsApprovalCount > 0) badge = String(needsApprovalCount);
        if (k === "inbox" && unansweredCount > 0) badge = String(unansweredCount);

        return (
          <Link
            key={k}
            href={route}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "13px 12px 14px",
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#0E8442" : "#475467",
              whiteSpace: "nowrap",
              minHeight: 46,
              textDecoration: "none",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={iconPath} />
            </svg>
            {label}
            {badge && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#B54708",
                  background: "#FEF6E7",
                  borderRadius: 20,
                  padding: "1px 7px",
                }}
              >
                {badge}
              </span>
            )}
            <span
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 0,
                height: 2.5,
                borderRadius: 3,
                background: isActive ? "#12A150" : "transparent",
              }}
            />
          </Link>
        );
      })}

    </div>
  );
}
