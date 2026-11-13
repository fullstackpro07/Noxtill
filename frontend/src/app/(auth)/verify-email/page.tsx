import { redirect } from "next/navigation";

/**
 * Email verification now uses a 6-digit code entered on Check your email. Links from older
 * verification emails land here and are sent to that screen, where a new code can be requested.
 */
export default function VerifyEmailPage() {
  redirect("/check-email");
}
