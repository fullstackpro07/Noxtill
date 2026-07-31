"use client";

import { CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ConnectorStatus } from "@/lib/integrations";

const STATUS_TONE: Record<ConnectorStatus, "success" | "danger" | "neutral"> = {
  connected: "success",
  needs_attention: "danger",
  not_connected: "neutral",
};

const STATUS_ICON: Record<ConnectorStatus, typeof CheckCircle2> = {
  connected: CheckCircle2,
  needs_attention: AlertTriangle,
  not_connected: Circle,
};

export function StatusChip({ status }: { status: ConnectorStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]}>
      <Icon className="h-3 w-3" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
