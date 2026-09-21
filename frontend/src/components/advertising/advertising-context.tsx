"use client";

import React, { createContext, useContext, useState, useMemo, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  fetchAdAccounts,
  fetchCampaigns,
  fetchAudiences,
  fetchCreatives,
  fetchAdLeads,
  fetchAdBudget,
  fetchAdPerformance,
  fetchAdSettings,
  createCampaign,
  updateCampaign,
  updateAdSettings,
  type AdAccountsRow,
  type AdCampaign,
  type AdAudience,
  type AdCreative,
  type AdLead,
  type AdPerformanceRow,
  type AdSettings,
  type AdProvider,
} from "@/lib/ads-api";
import { fetchProducts } from "@/lib/products-api";
import type { Product } from "@/lib/products";
import { fetchCompetitors, addCompetitor as addCompetitorApi, removeCompetitor } from "@/lib/competitors-api";
import type { Competitor } from "@/lib/competitors";
import { fetchReviews, type LiveInboxEntry } from "@/lib/reviews-api";

export type ScreenType =
  | "overview"
  | "campaigns"
  | "builder"
  | "audiences"
  | "creatives"
  | "calendar"
  | "leads"
  | "experiments"
  | "analytics"
  | "competitors"
  | "rules"
  | "settings";

export type DrawerType =
  | "brief"
  | "kpi"
  | "nba"
  | "campaign"
  | "review"
  | "audience"
  | "ad"
  | "lead"
  | "exp"
  | "comp"
  | null;

export type ModalType =
  | "autopilot"
  | "pause"
  | "launch"
  | "overlap"
  | "addcomp"
  | null;

export type AutopilotMode = "Off" | "Suggest only" | "Approval mode" | "Autopilot";

export interface ChipColors {
  bg: string;
  fg: string;
}

export function formatMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "Rs. 0";
  return "Rs. " + Math.round(Math.abs(Number(n))).toLocaleString("en-US");
}

export function formatNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "0";
  const num = Number(n);
  return num >= 1000 ? (num / 1000).toFixed(1).replace(".0", "") + "k" : String(num);
}

export function getChip(s: string | null | undefined): ChipColors {
  const m: Record<string, [string, string]> = {
    Active: ["#E8F7EE", "#0E8442"],
    Paused: ["#FEF6E7", "#B54708"],
    Scheduled: ["#EEF4FF", "#3538CD"],
    Draft: ["#F2F4F7", "#475467"],
    Completed: ["#F2F4F7", "#98A2B3"],
    Healthy: ["#E8F7EE", "#0E8442"],
    Fatigued: ["#FEF3F2", "#B42318"],
    Underperforming: ["#FEF6E7", "#B54708"],
    "Not started": ["#F2F4F7", "#475467"],
    New: ["#EEF4FF", "#3538CD"],
    Contacted: ["#FEF6E7", "#B54708"],
    Converted: ["#E8F7EE", "#0E8442"],
    High: ["#E8F7EE", "#0E8442"],
    Medium: ["#FEF6E7", "#B54708"],
    Low: ["#F2F4F7", "#475467"],
    "Sufficient data": ["#E8F7EE", "#0E8442"],
    "Not enough data": ["#FEF6E7", "#B54708"],
    Connected: ["#E8F7EE", "#0E8442"],
    "Not connected": ["#FEF6E7", "#B54708"],
    "Needs reconnect": ["#FEF3F2", "#B42318"],
  };
  const c = s ? m[s] : undefined;
  return { bg: c ? c[0] : "#F2F4F7", fg: c ? c[1] : "#475467" };
}

interface AdvertisingContextType {
  screen: ScreenType;
  setScreen: (s: ScreenType) => void;
  goToScreen: (s: ScreenType) => void;
  isOwner: boolean;
  userRoleName: string;
  userInitials: string;
  userName: string;

  // Modals & Drawers
  drawer: DrawerType;
  drawerItem: any;
  openDrawer: (t: DrawerType, item?: any) => void;
  closeDrawer: () => void;
  modal: ModalType;
  modalData: any;
  openModal: (t: ModalType, data?: any) => void;
  closeModal: () => void;
  closeAll: () => void;
  toast: string | null;
  flash: (msg: string) => void;

  // Global filters
  accountFilter: string;
  setAccountFilter: (a: string) => void;
  range: string;
  setRange: (r: string) => void;
  autopilot: AutopilotMode;
  setAutopilot: (m: AutopilotMode) => void;
  apColors: { bg: string; bd: string; fg: string };

  // Data
  campaigns: AdCampaign[];
  accounts: AdAccountsRow[];
  audiences: AdAudience[];
  creatives: AdCreative[];
  leads: AdLead[];
  performance: AdPerformanceRow[];
  settings: AdSettings | undefined;
  products: Product[];
  competitors: Competitor[];
  reviews: LiveInboxEntry[];
  isLoading: boolean;

  // Actions
  createCampaignAction: (provider: AdProvider, input: { name: string; goal: string; dailyBudget: number; meta?: Record<string, unknown> }) => Promise<AdCampaign>;
  pauseCampaignAction: (id: string) => Promise<void>;
  resumeCampaignAction: (id: string) => Promise<void>;
  addCompetitorAction: (name: string) => Promise<void>;
  removeCompetitorAction: (id: string) => Promise<void>;
  updateSettingsAction: (input: { defaultDailyBudgetCap?: number | null; autoPauseCostPerResult?: number | null; requireApproval?: boolean }) => Promise<void>;
}

const AdvertisingContext = createContext<AdvertisingContextType | null>(null);

export function AdvertisingProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [screen, setScreen] = useState<ScreenType>("overview");
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [drawerItem, setDrawerItem] = useState<any>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Global top filters
  const [accountFilter, setAccountFilter] = useState("All ad accounts");
  const [range, setRange] = useState("Last 30 days");
  const [autopilot, setAutopilot] = useState<AutopilotMode>("Approval mode");

  const apColors = useMemo(() => {
    switch (autopilot) {
      case "Off":
        return { bg: "#F2F4F7", bd: "#E6EAF0", fg: "#475467" };
      case "Suggest only":
        return { bg: "#EEF4FF", bd: "#C7D7FE", fg: "#3538CD" };
      case "Approval mode":
        return { bg: "#F7FCF9", bd: "#D5EFE0", fg: "#0E8442" };
      case "Autopilot":
        return { bg: "#E8F7EE", bd: "#BFE7CF", fg: "#0E8442" };
    }
  }, [autopilot]);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  };

  const openDrawer = (t: DrawerType, item?: any) => {
    setDrawer(t);
    setDrawerItem(item ?? null);
  };

  const closeDrawer = () => {
    setDrawer(null);
    setDrawerItem(null);
  };

  const openModal = (t: ModalType, data?: any) => {
    setModal(t);
    setModalData(data ?? null);
  };

  const closeModal = () => {
    setModal(null);
    setModalData(null);
  };

  const closeAll = () => {
    setDrawer(null);
    setDrawerItem(null);
    setModal(null);
    setModalData(null);
  };

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const seg = pathname.replace("/advertising", "").replace(/^\//, "") || "overview";
    setScreen(seg as ScreenType);
  }, [pathname]);

  const goToScreen = (s: ScreenType) => {
    setScreen(s);
    closeAll();
    const targetRoute = s === "overview" ? "/advertising" : `/advertising/${s}`;
    if (pathname !== targetRoute) {
      router.push(targetRoute);
    }
  };

  // Queries
  const { data: campaigns = [], isLoading: loadingCamps } = useQuery({
    queryKey: ["adCampaigns"],
    queryFn: fetchCampaigns,
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["adAccounts"],
    queryFn: fetchAdAccounts,
  });

  const { data: audiences = [] } = useQuery({
    queryKey: ["adAudiences"],
    queryFn: fetchAudiences,
  });

  const { data: creatives = [] } = useQuery({
    queryKey: ["adCreatives"],
    queryFn: fetchCreatives,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["adLeads"],
    queryFn: fetchAdLeads,
  });

  const { data: performance = [] } = useQuery({
    queryKey: ["adPerformance"],
    queryFn: fetchAdPerformance,
  });

  const { data: settings } = useQuery({
    queryKey: ["adSettings"],
    queryFn: fetchAdSettings,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitors,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews"],
    queryFn: fetchReviews,
  });

  // Role permissions
  const role = (user?.role || "owner").toLowerCase();
  const isOwner = role === "owner" || role === "admin" || role === "superadmin";
  const userRoleName = isOwner ? "Owner" : role === "manager" ? "Manager" : "Staff";
  const userName = user?.name || (isOwner ? "Olivia Smith" : "Staff Member");
  const userInitials = userName
    .split(" ")
    .map((p: string) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "OS";

  // Actions & Mutations
  const createCampaignMutation = useMutation({
    mutationFn: ({ provider, input }: { provider: AdProvider; input: { name: string; goal: string; dailyBudget: number; meta?: Record<string, unknown> } }) =>
      createCampaign(provider, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adCampaigns"] });
      queryClient.invalidateQueries({ queryKey: ["adPerformance"] });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { status?: "paused" | "active"; dailyBudget?: number } }) =>
      updateCampaign(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adCampaigns"] });
      queryClient.invalidateQueries({ queryKey: ["adPerformance"] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updateAdSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adSettings"] });
    },
  });

  const addCompMutation = useMutation({
    mutationFn: addCompetitorApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    },
  });

  const removeCompMutation = useMutation({
    mutationFn: removeCompetitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    },
  });

  const createCampaignAction = async (provider: AdProvider, input: { name: string; goal: string; dailyBudget: number; meta?: Record<string, unknown> }) => {
    const res = await createCampaignMutation.mutateAsync({ provider, input });
    flash(`Campaign "${input.name}" created and submitted.`);
    return res;
  };

  const pauseCampaignAction = async (id: string) => {
    await updateCampaignMutation.mutateAsync({ id, input: { status: "paused" } });
    flash("Campaign paused. Spend stops at the platform within minutes.");
  };

  const resumeCampaignAction = async (id: string) => {
    await updateCampaignMutation.mutateAsync({ id, input: { status: "active" } });
    flash("Campaign resumed — spend restarts at the platform.");
  };

  const addCompetitorAction = async (name: string) => {
    await addCompMutation.mutateAsync(name);
    flash(`Added "${name}" — public ad signals will be tracked.`);
  };

  const removeCompetitorAction = async (id: string) => {
    await removeCompMutation.mutateAsync(id);
    flash("Competitor removed from watchlist.");
  };

  const updateSettingsAction = async (input: { defaultDailyBudgetCap?: number | null; autoPauseCostPerResult?: number | null; requireApproval?: boolean }) => {
    await updateSettingsMutation.mutateAsync(input);
    flash("Advertising settings saved.");
  };

  return (
    <AdvertisingContext.Provider
      value={{
        screen,
        setScreen,
        goToScreen,
        isOwner,
        userRoleName,
        userInitials,
        userName,
        drawer,
        drawerItem,
        openDrawer,
        closeDrawer,
        modal,
        modalData,
        openModal,
        closeModal,
        closeAll,
        toast,
        flash,
        accountFilter,
        setAccountFilter,
        range,
        setRange,
        autopilot,
        setAutopilot,
        apColors,
        campaigns,
        accounts,
        audiences,
        creatives,
        leads,
        performance,
        settings,
        products,
        competitors,
        reviews,
        isLoading: loadingCamps || loadingAccounts,
        createCampaignAction,
        pauseCampaignAction,
        resumeCampaignAction,
        addCompetitorAction,
        removeCompetitorAction,
        updateSettingsAction,
      }}
    >
      {children}
    </AdvertisingContext.Provider>
  );
}

export function useAdvertising() {
  const ctx = useContext(AdvertisingContext);
  if (!ctx) throw new Error("useAdvertising must be used within an AdvertisingProvider");
  return ctx;
}
