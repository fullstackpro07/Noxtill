"use client";

import { Suspense } from "react";
import { BranchProfileView } from "@/components/branches/branch-profile-view";

export default function BranchProfilePage() {
  return (
    <Suspense>
      <BranchProfileView />
    </Suspense>
  );
}
