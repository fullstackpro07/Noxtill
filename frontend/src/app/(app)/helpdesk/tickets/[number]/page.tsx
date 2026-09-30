"use client";

import { useParams } from "next/navigation";
import { DetailScreen } from "@/components/helpdesk/hd-detail";

export default function HelpdeskTicketPage() {
  const { number } = useParams<{ number: string }>();
  return <DetailScreen key={number} number={decodeURIComponent(number)} />;
}
