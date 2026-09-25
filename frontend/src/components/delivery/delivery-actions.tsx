"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { toast as showToast } from "@/lib/toast";
import { createDelivery, fetchEligibleOrders } from "@/lib/deliveries-api";
import { fetchDeliveryZones } from "@/lib/delivery-zones-api";
import { fetchRiders, handInRiderCash, setRiderBreak, setRiderLocationConsent } from "@/lib/riders-api";

/** Refreshes every screen that shows deliveries, riders, queues or the figures derived from them. */
export function invalidateDeliveryData(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "delivery-queue",
    "delivery-riders-live",
    "delivery-riders",
    "delivery-intel",
    "delivery-kpis",
    "delivery-funnel",
    "delivery-map",
    "delivery-activity",
    "delivery-exceptions",
    "delivery-tracking",
    "delivery-pod",
    "delivery-analytics",
    "delivery-zones-summary",
    "delivery-automations",
    "delivery-rider-detail",
    "delivery-rider360",
    "deliveries",
    "deliveries-on-time-stats",
    "delivery-eligible-orders",
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function CreateDeliveryModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery({ queryKey: ["delivery-eligible-orders"], queryFn: fetchEligibleOrders });
  const { data: zones } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });
  const [orderId, setOrderId] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [note, setNote] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const selected = orders?.find((o) => o.id === orderId);
  const coordsValid = (lat === "" && lng === "") || (lat !== "" && lng !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)));

  const mutation = useMutation({
    mutationFn: () =>
      createDelivery({
        orderId,
        addressLine: address.trim(),
        zoneId: zoneId || undefined,
        deliveryNote: note.trim() || undefined,
        lat: lat !== "" ? Number(lat) : undefined,
        lng: lng !== "" ? Number(lng) : undefined,
      }),
    onSuccess: (d) => {
      showToast.success(d.riderId ? "Delivery created and auto-assigned to a rider." : "Delivery created — it is waiting for a rider.");
      invalidateDeliveryData(queryClient);
      onClose();
    },
    onError: (err) => showToast.error(err instanceof ApiError ? err.message : "Couldn't create this delivery."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create delivery"
      description="Turn an existing order into a delivery."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!orderId || !address.trim() || !coordsValid || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create delivery"}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading orders…</p>
      ) : !orders || orders.length === 0 ? (
        <p className="text-sm text-fg-muted">Every order already has a delivery. Ring up the order first (Fast Sale or Orders), then come back here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Select
            label="Order"
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              const o = orders.find((x) => x.id === e.target.value);
              setAddress(o?.customerAddress ?? "");
            }}
          >
            <option value="">Choose an order…</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.orderNo} · {o.customerName ?? "Walk-in"} · Rs. {Math.round(o.total).toLocaleString("en-US")} · {o.orderType}
              </option>
            ))}
          </Select>
          <Input label="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={selected ? "Where should the rider go?" : "Choose an order first"} />
          <Select label="Zone (sets the fee and the promised time)" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">No zone</option>
            {(zones ?? [])
              .filter((z) => z.active)
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
          </Select>
          <Input label="Note for the rider (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ring the bell twice, gate on the left" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude (optional)" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="31.5204" />
            <Input label="Longitude (optional)" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="74.3587" />
          </div>
          <p className="text-xs text-fg-faint">
            Leave the coordinates blank to look the address up automatically when a maps key is configured. Without coordinates the delivery has no map pin, distance or distance-based fee.
          </p>
        </div>
      )}
    </Dialog>
  );
}

/** Real rider actions: break toggle, cash hand-in, and location-sharing consent. */
export function RiderActions({ riderId }: { riderId: string }) {
  const queryClient = useQueryClient();
  const { data: roster } = useQuery({ queryKey: ["delivery-riders"], queryFn: fetchRiders });
  const rider = roster?.find((r) => r.id === riderId);

  const onDone = (msg: string) => () => {
    showToast.success(msg);
    invalidateDeliveryData(queryClient);
  };
  const onError = (err: unknown) => showToast.error(err instanceof ApiError ? err.message : "That didn't work.");

  const breakMutation = useMutation({
    mutationFn: (onBreak: boolean) => setRiderBreak(riderId, onBreak),
    onSuccess: (_r, onBreak) => onDone(onBreak ? "Marked on break." : "Back on shift.")(),
    onError,
  });
  const handInMutation = useMutation({ mutationFn: () => handInRiderCash(riderId), onSuccess: onDone("Cash hand-in recorded."), onError });
  const consentMutation = useMutation({
    mutationFn: (consent: boolean) => setRiderLocationConsent(riderId, consent),
    onSuccess: onDone("Location-sharing consent updated."),
    onError,
  });

  if (!rider) return null;
  const onBreak = !!rider.onBreakSince;

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {rider.status === "active" && (
        <Button size="sm" variant="outline" disabled={breakMutation.isPending} onClick={() => breakMutation.mutate(!onBreak)}>
          {onBreak ? "End break" : "Start break"}
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={handInMutation.isPending || rider.cashHeld <= 0} onClick={() => handInMutation.mutate()}>
        {rider.cashHeld > 0 ? `Record hand-in of Rs. ${Math.round(rider.cashHeld).toLocaleString("en-US")}` : "No cash to hand in"}
      </Button>
      <Button size="sm" variant="outline" disabled={consentMutation.isPending} onClick={() => consentMutation.mutate(!rider.shareLocationConsent)}>
        {rider.shareLocationConsent ? "Customer tracking: consented (revoke)" : "Record consent to share live position"}
      </Button>
    </div>
  );
}
