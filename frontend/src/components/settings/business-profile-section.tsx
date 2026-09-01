"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, Phone, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { SettingsSectionHeader } from "./settings-section-header";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import { fetchBusinessProfile, updateBusinessProfile, type BusinessProfile, type UpdateBusinessProfile } from "@/lib/businesses-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

export function BusinessProfileSection() {
  const { t } = useTranslation();

  const { data: profile, isPending, isError, refetch } = useQuery({
    queryKey: ["business-profile"],
    queryFn: fetchBusinessProfile,
  });

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.business.label")}
        description={t("settings.section.business.description")}
      />
      {isError ? (
        <ErrorBanner title="Couldn't load your business profile" onRetry={() => refetch()} />
      ) : isPending || !profile ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        // Keyed by id so a background refetch never clobbers in-progress edits — this form only
        // re-initializes if the underlying business record itself changes.
        <BusinessProfileForm key={profile.id} initial={profile} />
      )}
    </div>
  );
}

function BusinessProfileForm({ initial }: { initial: BusinessProfile }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);

  const mutation = useMutation({
    mutationFn: (dto: UpdateBusinessProfile) => updateBusinessProfile(dto),
    onSuccess: (updated) => {
      queryClient.setQueryData(["business-profile"], updated);
      toast.success("Business profile saved.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save these changes — please try again.");
    },
  });

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <Input
        label={t("settings.business.name")}
        leadingSlot={<Store className="h-4 w-4" aria-hidden />}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input
        label={t("settings.business.phone")}
        leadingSlot={<Phone className="h-4 w-4" aria-hidden />}
        value={form.phone ?? ""}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <Input
        label={t("settings.business.address")}
        leadingSlot={<MapPin className="h-4 w-4" aria-hidden />}
        value={form.address ?? ""}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label={t("settings.business.currency")} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {Array.from(new Set(COUNTRIES.map((c) => c.currency))).map((cur) => (
            <option key={cur} value={cur}>
              {cur}
            </option>
          ))}
        </Select>
        <Select label={t("settings.business.timezone")} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex justify-end pt-2">
        <Button
          onClick={() =>
            mutation.mutate({
              name: form.name,
              phone: form.phone ?? "",
              address: form.address ?? "",
              currency: form.currency,
              timezone: form.timezone,
            })
          }
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
