"use client";

import { use } from "react";
import { UserDetailView } from "@/components/super-admin/views/users-view";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserDetailView id={id} />;
}
