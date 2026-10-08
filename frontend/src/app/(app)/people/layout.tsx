import { Suspense, type ReactNode } from "react";
import { PeopleShell } from "@/components/people/pp-shell";

export default function PeopleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <PeopleShell>{children}</PeopleShell>
    </Suspense>
  );
}
