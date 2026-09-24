import type { ReactNode } from "react";
import { RxDataProvider } from "@/components/receptionist/rx-data";
import { ReceptionistShell } from "@/components/receptionist/receptionist-shell";

export default function ReceptionistLayout({ children }: { children: ReactNode }) {
  return (
    <RxDataProvider>
      <ReceptionistShell>{children}</ReceptionistShell>
    </RxDataProvider>
  );
}
