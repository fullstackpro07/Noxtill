import { Suspense, type ReactNode } from "react";
import { ProjectsShell } from "@/components/projects/projects-shell";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <ProjectsShell>{children}</ProjectsShell>
    </Suspense>
  );
}
