import type { HelpArticle } from "@/lib/help-api";

/** `HelpArticle` has no real category field — this derives a display label from the first word of
 * its real `slug` (e.g. "bookings-availability" → "Bookings"), a mechanical, honest read of real
 * data rather than an invented taxonomy. */
export function categoryForArticle(article: HelpArticle): string {
  const first = article.slug.split("-")[0] ?? article.slug;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
