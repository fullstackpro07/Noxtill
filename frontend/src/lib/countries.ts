export interface Country {
  code: string;
  name: string;
  dialCode: string;
  currency: string;
}

/** Curated, not exhaustive — enough to prove the "country changes currency/language suggestion" flow. */
export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dialCode: "+1", currency: "USD" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", currency: "GBP" },
  { code: "PK", name: "Pakistan", dialCode: "+92", currency: "PKR" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", currency: "SAR" },
  { code: "IN", name: "India", dialCode: "+91", currency: "INR" },
  { code: "EG", name: "Egypt", dialCode: "+20", currency: "EGP" },
  { code: "NG", name: "Nigeria", dialCode: "+234", currency: "NGN" },
  { code: "ES", name: "Spain", dialCode: "+34", currency: "EUR" },
  { code: "FR", name: "France", dialCode: "+33", currency: "EUR" },
  { code: "MX", name: "Mexico", dialCode: "+52", currency: "MXN" },
  { code: "CA", name: "Canada", dialCode: "+1", currency: "CAD" },
];

/** Country → suggested language, used only to pre-fill the language picker, never to override a manual choice. */
export const COUNTRY_TO_LOCALE: Record<string, string> = {
  PK: "ur",
  AE: "ar",
  SA: "ar",
  EG: "ar",
  ES: "es",
  MX: "es",
  FR: "fr",
  IN: "hi",
};

export function countryByCode(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}
