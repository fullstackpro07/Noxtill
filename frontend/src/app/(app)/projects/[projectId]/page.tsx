"use client";

import { useParams } from "next/navigation";
import { ProjectDetailView } from "@/components/projects/project-360-view";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <ProjectDetailView id={projectId} />;
}
