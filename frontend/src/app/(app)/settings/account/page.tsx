import { redirect } from "next/navigation";

export default function AccountIndex() {
  redirect("/settings/account/plan");
}
