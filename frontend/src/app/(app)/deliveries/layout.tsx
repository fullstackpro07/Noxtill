import type { ReactNode } from "react";
import { DeliveryShell } from "@/components/delivery/delivery-shell";

export default function DeliveriesLayout({ children }: { children: ReactNode }) {
  return <DeliveryShell>{children}</DeliveryShell>;
}
