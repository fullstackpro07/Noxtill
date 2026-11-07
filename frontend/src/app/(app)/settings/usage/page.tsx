import { redirect } from "next/navigation";

export default function UsageIndex() {
  redirect("/settings/usage/overview");
}
