"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateDeliverySettings, type UpdateDeliverySettingsInput } from "@/lib/delivery-settings-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** One shared way to change a delivery setting or switch: saves for real, then refreshes every screen that reads it. */
export function useDeliverySettingMutation(successMessage = "Saved.") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateDeliverySettingsInput) => updateDeliverySettings(patch),
    onSuccess: () => {
      toast.success(successMessage);
      for (const key of ["delivery-settings", "delivery-automations", "delivery-zones-summary", "delivery-kpis", "delivery-map", "delivery-analytics"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this setting."),
  });
}
