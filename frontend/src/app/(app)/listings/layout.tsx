import type { ReactNode } from "react";
import { ListingsProvider } from "@/components/listings/listings-context";
import { ListingsShell } from "@/components/listings/listings-shell";

export default function ListingsLayout({ children }: { children: ReactNode }) {
  return (
    <ListingsProvider>
      <ListingsShell>{children}</ListingsShell>
    </ListingsProvider>
  );
}
