import { redirect } from "next/navigation";

/** The demo-data screen that lived here is gone — this provider is managed from its real module. */
export default function Page() {
  redirect("/integrations?provider=merchant");
}
