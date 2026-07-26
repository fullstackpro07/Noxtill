export type LocaleCode = "en" | "ur" | "ar" | "es" | "fr" | "hi";

/** Layout direction is always left-to-right regardless of locale — only the language of the text changes. */
export interface LocaleOption {
  code: LocaleCode;
  label: string;
  nativeLabel: string;
  /** Suggested default currency for this language's most common market — a starting point, never a lock. */
  suggestedCurrency: string;
}

export const LOCALES: LocaleOption[] = [
  { code: "en", label: "English", nativeLabel: "English", suggestedCurrency: "USD" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", suggestedCurrency: "PKR" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", suggestedCurrency: "AED" },
  { code: "es", label: "Spanish", nativeLabel: "Español", suggestedCurrency: "USD" },
  { code: "fr", label: "French", nativeLabel: "Français", suggestedCurrency: "EUR" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", suggestedCurrency: "INR" },
];

export function localeByCode(code: string): LocaleOption {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
