import { redirect } from "next/navigation";

export default function CreditOverduePage() {
  redirect("/credit/due?tab=Overdue");
}
