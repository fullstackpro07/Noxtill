import { redirect } from "next/navigation";

export default function CreditDueTodayPage() {
  redirect("/credit/due?tab=Due+Today");
}
