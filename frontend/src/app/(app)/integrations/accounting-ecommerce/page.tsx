import { redirect } from "next/navigation";

/** The old combined screen is now two tabs; keep the URL working. */
export default function AccountingEcommerceRedirect() {
  redirect("/integrations/accounting");
}
