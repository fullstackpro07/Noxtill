"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { s } from "@/components/site/legal/s";
import { fetchPublicStatus } from "@/lib/legal-public-api";

/** Trust Center "Service status" tile — reads the live status check; never shows a state it didn't receive. */
export function StatusCard() {
  const [text, setText] = useState("Checking live status…");
  const [dot, setDot] = useState("#9FB3AA");
  useEffect(() => {
    fetchPublicStatus()
      .then((d) => {
        setText(d.summary);
        const bad = d.components.some((c) => c.status === "outage");
        setDot(bad ? "#B4362A" : "#079A63");
      })
      .catch(() => {
        setText("Live status unavailable");
        setDot("#9FB3AA");
      });
  }, []);
  return (
    <Link href="/status" style={s("display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8; text-decoration: none; color: #0B1822;")}>
      <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #4C5B63;")}>Service status</span>
      <span style={s("display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 800;")}>
        <span aria-hidden="true" style={s(`width: 10px; height: 10px; border-radius: 50%; background: ${dot};`)} />
        {text}
      </span>
      <span style={s("font-size: 14px; color: #3A4A52;")}>View components and incidents →</span>
    </Link>
  );
}
