"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { CustomerProfileView } from "@/components/customers/customer-profile-view";
import { findCustomerById } from "@/lib/customers";
import { useMockSession } from "@/lib/mock-session";

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useMockSession();
  const customer = findCustomerById(id);

  if (!customer) notFound();

  return <CustomerProfileView customer={customer} currency={session.business.currency} />;
}
