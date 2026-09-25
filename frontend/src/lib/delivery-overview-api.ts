import { apiFetch } from "@/lib/api-client";

export interface DeliveryKpi {
  key: string;
  l: string;
  v: string;
  sub: string;
  color: string;
  bd: string;
}

export interface DeliveryFunnelStage {
  l: string;
  v: string;
  w: string;
  c: string;
}

export interface DeliveryMapPin {
  i: string;
  kind: "rider" | "delivery";
  late: boolean;
  unassigned: boolean;
  left: string;
  top: string;
  bg: string;
  radius: string;
  label: string;
  aria: string;
}

export interface DeliveryMap {
  hub: { lat: number; lng: number } | null;
  hubPin: { left: string; top: string } | null;
  hubIsReal: boolean;
  pins: DeliveryMapPin[];
  legend: { c: string; l: string }[];
}

export interface DeliveryIntelItem {
  i: number;
  kind: string;
  bg: string;
  fg: string;
  basis: string;
  t: string;
  ev: string;
  why: string;
  action: {
    kind: "call" | "handin" | "assign" | "dispatch";
    label: string;
    phone?: string;
    riderId?: string;
    deliveryId?: string;
  };
}

export interface DeliveryActivityItem {
  t: string;
  when: string;
  bg: string;
  fg: string;
  icon: string;
}

export interface RiderLiveEntry {
  i: string;
  n: string;
  init: string;
  zone: string;
  st: string;
  bg: string;
  fg: string;
  stops: number;
  cap: number;
  cash: number;
  loadW: string;
  loadColor: string;
  stale: boolean;
  seen: string;
}

export interface QueueEntry {
  i: string;
  id: string;
  cust: string;
  addr: string;
  dist: string;
  items: number;
  pay: string;
  paid: boolean;
  pri: "Urgent" | "High value" | "Normal";
  waited: string;
  note: string;
  rider: string | null;
  riderId: string | null;
  why: string;
}

export interface DelayedRow {
  id: string;
  cust: string;
  amt: string;
  note: string;
}

export type OverviewPeriod = "today" | "yesterday" | "week" | "month";

export function fetchOverviewKpis(period: OverviewPeriod = "today"): Promise<DeliveryKpi[]> {
  return apiFetch<DeliveryKpi[]>(`/delivery-overview/kpis?period=${period}`);
}
export function fetchOverviewFunnel(): Promise<DeliveryFunnelStage[]> {
  return apiFetch<DeliveryFunnelStage[]>("/delivery-overview/funnel");
}
export function fetchOverviewMap(): Promise<DeliveryMap> {
  return apiFetch<DeliveryMap>("/delivery-overview/map");
}
export function fetchOverviewIntel(): Promise<DeliveryIntelItem[]> {
  return apiFetch<DeliveryIntelItem[]>("/delivery-overview/intel");
}
export function fetchOverviewActivity(): Promise<DeliveryActivityItem[]> {
  return apiFetch<DeliveryActivityItem[]>("/delivery-overview/activity");
}
export function fetchRidersLive(): Promise<RiderLiveEntry[]> {
  return apiFetch<RiderLiveEntry[]>("/delivery-overview/riders-live");
}
export function fetchDispatchQueue(): Promise<QueueEntry[]> {
  return apiFetch<QueueEntry[]>("/delivery-overview/queue");
}
export function fetchDelayedDeliveries(): Promise<DelayedRow[]> {
  return apiFetch<DelayedRow[]>("/delivery-overview/delayed");
}

export interface RiderDetail {
  i: string;
  n: string;
  init: string;
  zone: string;
  veh: string;
  st: string;
  bg: string;
  fg: string;
  stale: boolean;
  seen: string;
  done: number;
  stops: number;
  otd: string;
  cash: string;
  capacity: number;
  next: { n: string; cust: string; addr: string; eta: string; etaColor: string }[];
}
export function fetchRiderDetail(riderId: string): Promise<RiderDetail> {
  return apiFetch<RiderDetail>(`/delivery-overview/rider/${riderId}`);
}

export interface FreshnessRow {
  l: string;
  v: string;
  last: string;
  c: string;
}
export function fetchFreshness(): Promise<{ rows: FreshnessRow[] }> {
  return apiFetch<{ rows: FreshnessRow[] }>("/delivery-overview/freshness");
}
