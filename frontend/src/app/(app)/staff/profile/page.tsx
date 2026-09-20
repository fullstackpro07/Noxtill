"use client";

import { Suspense } from "react";
import { StaffProfileView } from "@/components/staff/staff-profile-view";

export default function StaffProfilePage() {
  return (
    <Suspense fallback={null}>
      <StaffProfileView />
    </Suspense>
  );
}
