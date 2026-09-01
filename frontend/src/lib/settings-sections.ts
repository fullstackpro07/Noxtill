import type { LucideIcon } from "lucide-react";
import { Store, MessageSquare, Moon, Bell, Globe, Receipt, CreditCard, ShieldCheck, Lock, Tags, ListChecks, TriangleAlert } from "lucide-react";

export interface SettingsSection {
  key: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Danger Zone is visually and semantically separated from the rest (FE-010). */
  danger?: boolean;
}

/** labelKey resolves via useTranslation() — see src/lib/i18n.ts settings.section.* keys. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: "business", labelKey: "settings.section.business.label", href: "/settings/business", icon: Store },
  { key: "messages", labelKey: "settings.section.messages.label", href: "/settings/messages", icon: MessageSquare },
  { key: "nightly-close", labelKey: "settings.section.nightlyClose.label", href: "/settings/nightly-close", icon: Moon },
  { key: "notifications", labelKey: "settings.section.notifications.label", href: "/settings/notifications", icon: Bell },
  { key: "language", labelKey: "settings.section.language.label", href: "/settings/language", icon: Globe },
  { key: "tax", labelKey: "settings.section.tax.label", href: "/settings/tax", icon: Receipt },
  { key: "billing", labelKey: "settings.section.billing.label", href: "/settings/billing", icon: CreditCard },
  { key: "privacy", labelKey: "settings.section.privacy.label", href: "/settings/privacy", icon: ShieldCheck },
  { key: "security", labelKey: "settings.section.security.label", href: "/settings/security", icon: Lock },
  { key: "labels", labelKey: "settings.section.labels.label", href: "/settings/labels", icon: Tags },
  { key: "options", labelKey: "settings.section.options.label", href: "/settings/options", icon: ListChecks },
  { key: "danger-zone", labelKey: "settings.section.dangerZone.label", href: "/settings/danger-zone", icon: TriangleAlert, danger: true },
];
