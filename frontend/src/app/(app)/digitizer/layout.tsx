import type { ReactNode } from "react";
import { DigitizerDataProvider } from "@/components/digitizer/digitizer-data";
import { DigitizerShell } from "@/components/digitizer/digitizer-shell";

export default function DigitizerLayout({ children }: { children: ReactNode }) {
  return (
    <DigitizerDataProvider>
      <DigitizerShell>{children}</DigitizerShell>
    </DigitizerDataProvider>
  );
}
