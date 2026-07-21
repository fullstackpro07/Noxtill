export interface BusinessLocale {
    currency: string;
    locale: string;
    timezone: string;
}
export declare class LocaleService {
    formatCurrency(amount: number | string, business: Pick<BusinessLocale, 'currency' | 'locale'>): string;
    formatDate(date: Date, business: Pick<BusinessLocale, 'locale' | 'timezone'>): string;
    formatDateTime(date: Date, business: Pick<BusinessLocale, 'locale' | 'timezone'>): string;
    currentLocalTime(timezone: string, at?: Date): string;
}
