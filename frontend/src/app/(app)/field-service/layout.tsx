import { Suspense, type ReactNode } from "react";
import { FieldServiceShell } from "@/components/field-service/fs-shell";

export default function FieldServiceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <FieldServiceShell>{children}</FieldServiceShell>
    </Suspense>
  );
}
