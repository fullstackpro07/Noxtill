export function formatCurrency(value: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(value: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

export function daysAgo(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
}
