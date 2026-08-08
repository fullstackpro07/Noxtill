"use client";

import { useState } from "react";
import { Store, Phone, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "./settings-section-header";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

export function BusinessProfileSection() {
  const session = useSession();
  const { t } = useTranslation();
  const [name, setName] = useState(session.business.name);
  const [phone, setPhone] = useState("+1 555 013 8420");
  const [address, setAddress] = useState("482 Elm Street, Springfield");
  const [currency, setCurrency] = useState(session.business.currency);
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    toast.success("Business profile saved. Live save wires up in INT-005.");
  }

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.business.label")}
        description={t("settings.section.business.description")}
      />
      <div className="flex flex-col gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <Input label={t("settings.business.name")} leadingSlot={<Store className="h-4 w-4" aria-hidden />} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={t("settings.business.phone")} leadingSlot={<Phone className="h-4 w-4" aria-hidden />} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label={t("settings.business.address")} leadingSlot={<MapPin className="h-4 w-4" aria-hidden />} value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label={t("settings.business.currency")} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {Array.from(new Set(COUNTRIES.map((c) => c.currency))).map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </Select>
          <Select label={t("settings.business.timezone")} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
