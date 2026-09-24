import { redirect } from "next/navigation";

export default function MissedCallsRedirect() {
  redirect("/receptionist/queue");
}
