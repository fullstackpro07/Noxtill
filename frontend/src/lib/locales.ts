export interface LocaleOption {
  code: string;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
  /** Suggested default currency for this language's most common market — a starting point, never a lock. */
  suggestedCurrency: string;
}

export const LOCALES: LocaleOption[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr", suggestedCurrency: "USD" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", dir: "rtl", suggestedCurrency: "PKR" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl", suggestedCurrency: "AED" },
  { code: "es", label: "Spanish", nativeLabel: "Español", dir: "ltr", suggestedCurrency: "USD" },
  { code: "fr", label: "French", nativeLabel: "Français", dir: "ltr", suggestedCurrency: "EUR" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", dir: "ltr", suggestedCurrency: "INR" },
];

export function localeByCode(code: string): LocaleOption {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
