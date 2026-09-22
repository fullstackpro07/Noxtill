"use client";

import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMasterListing,
  updateMasterListing,
  syncListings,
  fetchListingHealth,
  fetchSyncLog,
  fetchCitationAudit,
  fetchListingsRollup,
  fetchListingsRollupSummary,
  type MasterListing,
  type UpdateMasterListing,
  type ListingHealth,
  type ListingSyncLogRow,
  type CitationAuditRow,
  type ListingRollupItem,
  type ListingsRollupSummary,
} from "@/lib/master-listing-api";
import { fetchIntegrations, connectIntegration, disconnectIntegration, type ConnectResult } from "@/lib/integrations-api";
import type { ConnectorKey } from "@/lib/integrations";
import { fetchBranches, type Branch } from "@/lib/branches-api";
import {
  fetchListingPhotos,
  createListingPhoto,
  deleteListingPhoto,
  pushListingPhoto,
  type ListingPhoto,
  type ListingPhotoCategory,
  type PhotoPushResult,
} from "@/lib/listing-photos-api";
import {
  fetchGmbPhotos,
  fetchGmbPosts,
  fetchGmbInsights,
  createGmbPost,
  publishGmbPost,
  deleteGmbPost,
  type GmbPhoto,
  type GmbPost,
  type GmbInsightsSnapshot,
} from "@/lib/gmb-api";
import { fetchReviewsSummary, fetchReviews, type ReviewsSummary, type LiveInboxEntry } from "@/lib/reviews-api";
import { fetchCompetitors } from "@/lib/competitors-api";
import type { Competitor } from "@/lib/competitors";
import { fetchProducts } from "@/lib/products-api";
import type { Product } from "@/lib/products";
import {
  fetchListingSettings,
  updateListingSettings,
  type ListingSettings,
} from "@/lib/listing-settings-api";
import { toast } from "@/lib/toast";
import { useBranchContextStore } from "@/store/branch-context-store";
import { useAuthStore } from "@/store/auth-store";

/**
 * One real row per (branch x connected directory provider), built from `GET /listings/rollup` —
 * every field here traces to a real Prisma row (MasterListing/Integration/Citation/ListingSyncLog),
 * never a fixed demo value. See `ListingsRollupService` on the backend for how each is computed.
 */
export interface UnifiedListingItem {
  id: string;
  branchId: string;
  provider: string;
  platform: string;
  platformShort: string;
  platIcon: string;
  business: string;
  location: string;
  address: string;
  phone: string;
  category: string;
  hasMasterListing: boolean;
  status: "Connected" | "Needs attention" | "Disconnected" | "Not connected";
  statusTone: "green" | "amber" | "red" | "neutral";
  /** No connector in this codebase exposes a real verification API. */
  verification: "Not tracked";
  verifyTone: "neutral";
  sync: string;
  syncTone: "green" | "amber" | "red" | "neutral";
  completeness: string;
  completenessPercent: number | null;
  photoCount: number;
  mismatchedFields: string[];
  nextAction: string;
  nextWhy: string;
}

export interface PanelState {
  kicker: string;
  title: string;
  badge: string;
  badgeTone?: "green" | "amber" | "red" | "blue" | "purple" | "neutral";
  answerLabel?: string;
  answer?: string;
  rows?: [string, string, ("pos" | "neg" | "muted" | "neutral")?][];
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
  primary?: string;
  secondary?: string;
  primaryTone?: "green" | "red" | "blue";
  onPrimary?: () => void;
}

export interface ConfirmState {
  title: string;
  body: string;
  tone?: "green" | "amber" | "red";
  icon?: string;
  rows?: [string, string, ("pos" | "neg" | "muted" | "neutral")?][];
  primary?: string;
  cancel?: string;
  onConfirm?: () => void;
}

export interface ToastState {
  title: string;
  sub?: string;
}

interface ListingsContextType {
  // State
  /** The branch id that GMB photos/posts/reviews/insights queries actually reflect right now — null means "no child branch selected" (the owner's own business). */
  currentBranchId: string | null;
  location: string;
  platform: string;
  searchQuery: string;
  selectedListing: UnifiedListingItem | null;
  activeLdSection: string;
  panel: PanelState | null;
  confirm: ConfirmState | null;
  toastMsg: ToastState | null;

  // Setters
  setLocation: (loc: string) => void;
  setPlatform: (plat: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveLdSection: (section: string) => void;
  cycleLocation: () => void;
  cyclePlatform: () => void;

  // Actions / Overlays
  openListing: (listing: UnifiedListingItem, section?: string) => void;
  openPanel: (panel: PanelState) => void;
  openConfirm: (confirm: ConfirmState) => void;
  closeOverlays: () => void;
  notify: (title: string, sub?: string) => void;
  closeToast: () => void;
  openSyncPreview: (listing: UnifiedListingItem) => void;
  askAI: (key?: string) => void;

  // Data
  masterListing: MasterListing | undefined;
  health: ListingHealth | undefined;
  syncLog: ListingSyncLogRow[];
  citations: CitationAuditRow[];
  liveStatuses: Record<string, string> | undefined;
  branches: Branch[];
  listingPhotos: ListingPhoto[];
  gmbPhotos: GmbPhoto[];
  gmbPosts: GmbPost[];
  reviewsSummary: ReviewsSummary | undefined;
  reviews: LiveInboxEntry[];
  competitors: Competitor[];
  services: Product[];
  settings: ListingSettings | undefined;
  rollupSummary: ListingsRollupSummary | undefined;
  gmbInsights: GmbInsightsSnapshot[];

  // Computed
  listings: UnifiedListingItem[];
  filteredListings: UnifiedListingItem[];
  isMasterLoading: boolean;

  // Mutations
  syncNow: (branchId?: string) => void;
  isSyncing: boolean;
  updateMaster: (dto: UpdateMasterListing) => Promise<void>;
  updateListingSettingsAction: (dto: Partial<ListingSettings>) => Promise<void>;
  createPostAction: (dto: { text: string; photoUrl?: string }) => Promise<void>;
  connectListingAction: (provider: string, branchId: string) => Promise<ConnectResult>;
  disconnectListingAction: (provider: string, branchId: string) => Promise<void>;
  addPhotoAction: (dto: { url: string; category: ListingPhotoCategory }) => Promise<void>;
  removePhotoAction: (id: string) => Promise<void>;
  pushPhotoAction: (id: string, providers?: string[]) => Promise<PhotoPushResult[]>;
  publishPostAction: (id: string) => Promise<void>;
  deletePostAction: (id: string) => Promise<void>;
}

const ListingsContext = createContext<ListingsContextType | null>(null);

export function ListingsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchContextStore((s) => s.selectedBranchId);
  const ownBusinessId = useAuthStore((s) => s.business?.id) ?? null;
  // The branch the rest of the app (GMB photos/posts/reviews queries) is actually reading right
  // now — those queries are CLS-scoped to whichever branch is globally active, not to whichever
  // row of the cross-branch listings grid a person happens to be looking at.
  const currentBranchId = selectedBranchId ?? ownBusinessId;

  // Filters
  const [location, setLocation] = useState("All locations");
  const [platform, setPlatform] = useState("All platforms");
  const [searchQuery, setSearchQuery] = useState("");

  // Overlays
  const [selectedListing, setSelectedListing] = useState<UnifiedListingItem | null>(null);
  const [activeLdSection, setActiveLdSection] = useState("Profile");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toastMsg, setToastMsg] = useState<ToastState | null>(null);

  // Queries
  const { data: masterListing, isLoading: isMasterLoading } = useQuery({
    queryKey: ["master-listing"],
    queryFn: fetchMasterListing,
  });

  const { data: health } = useQuery({
    queryKey: ["listing-health"],
    queryFn: fetchListingHealth,
  });

  const { data: syncLog = [] } = useQuery({
    queryKey: ["listing-sync-log"],
    queryFn: fetchSyncLog,
  });

  const { data: citations = [] } = useQuery({
    queryKey: ["citation-audit"],
    queryFn: fetchCitationAudit,
  });

  const { data: liveStatuses } = useQuery({
    queryKey: ["integrations"],
    queryFn: fetchIntegrations,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches,
  });

  const { data: listingPhotos = [] } = useQuery({
    queryKey: ["listing-photos"],
    queryFn: fetchListingPhotos,
  });

  const { data: gmbPhotos = [] } = useQuery({
    queryKey: ["gmb-photos"],
    queryFn: fetchGmbPhotos,
  });

  const { data: gmbPosts = [] } = useQuery({
    queryKey: ["gmb-posts"],
    queryFn: fetchGmbPosts,
  });

  const { data: reviewsSummary } = useQuery({
    queryKey: ["reviews-summary"],
    queryFn: fetchReviewsSummary,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews"],
    queryFn: fetchReviews,
  });

  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitors,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: () => fetchProducts({ kind: "service" }),
  });

  const { data: settings } = useQuery({
    queryKey: ["listing-settings"],
    queryFn: fetchListingSettings,
  });

  const { data: rollupItems = [] } = useQuery({
    queryKey: ["listings-rollup"],
    queryFn: fetchListingsRollup,
  });

  const { data: rollupSummary } = useQuery({
    queryKey: ["listings-rollup-summary"],
    queryFn: fetchListingsRollupSummary,
  });

  // Real GMB Performance-API history — only meaningful for the gmb provider, used by the "Local
  // search" section of the listing workspace. Fetches, never pulls (pulling is a manual action
  // elsewhere) — an empty array here honestly means "never pulled", not "no activity".
  const { data: gmbInsights = [] } = useQuery({
    queryKey: ["gmb-insights"],
    queryFn: fetchGmbInsights,
  });

  // Mutations
  const syncMutation = useMutation({
    mutationFn: syncListings,
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "failed").length;
      if (failed > 0) {
        toast.info(`Synced — ${results.length - failed} succeeded, ${failed} failed.`);
      } else if (results.length === 0) {
        toast.info("No connected directories to sync yet.");
      } else {
        toast.success(`Synced to ${results.length} director${results.length === 1 ? "y" : "ies"}.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["listing-health"] });
      void queryClient.invalidateQueries({ queryKey: ["listing-sync-log"] });
      void queryClient.invalidateQueries({ queryKey: ["citation-audit"] });
      void queryClient.invalidateQueries({ queryKey: ["listings-rollup"] });
      void queryClient.invalidateQueries({ queryKey: ["listings-rollup-summary"] });
    },
    onError: (err: Error) => toast.error(err?.message || "Sync failed"),
  });

  const masterUpdateMutation = useMutation({
    mutationFn: updateMasterListing,
    onSuccess: () => {
      toast.success("Master business record updated.");
      void queryClient.invalidateQueries({ queryKey: ["master-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["listing-health"] });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: updateListingSettings,
    onSuccess: () => {
      toast.success("Listing settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["listing-settings"] });
    },
  });

  const postCreateMutation = useMutation({
    mutationFn: createGmbPost,
    onSuccess: () => {
      toast.success("Post drafted.");
      void queryClient.invalidateQueries({ queryKey: ["gmb-posts"] });
    },
  });

  const publishPostMutation = useMutation({
    mutationFn: publishGmbPost,
    onSuccess: () => {
      toast.success("Post published to Google Business Profile.");
      void queryClient.invalidateQueries({ queryKey: ["gmb-posts"] });
    },
    onError: (err: Error) => toast.error(err?.message || "Publish failed"),
  });

  const deletePostMutation = useMutation({
    mutationFn: deleteGmbPost,
    onSuccess: () => {
      toast.success("Post deleted.");
      void queryClient.invalidateQueries({ queryKey: ["gmb-posts"] });
    },
  });

  const addPhotoMutation = useMutation({
    mutationFn: createListingPhoto,
    onSuccess: () => {
      toast.success("Photo added.");
      void queryClient.invalidateQueries({ queryKey: ["listing-photos"] });
      void queryClient.invalidateQueries({ queryKey: ["listings-rollup"] });
      void queryClient.invalidateQueries({ queryKey: ["listings-rollup-summary"] });
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: deleteListingPhoto,
    onSuccess: () => {
      toast.success("Photo removed.");
      void queryClient.invalidateQueries({ queryKey: ["listing-photos"] });
      void queryClient.invalidateQueries({ queryKey: ["listings-rollup"] });
      void queryClient.invalidateQueries({ queryKey: ["listings-rollup-summary"] });
    },
  });

  const pushPhotoMutation = useMutation({
    mutationFn: ({ id, providers }: { id: string; providers?: string[] }) => pushListingPhoto(id, providers),
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "failed").length;
      if (results.length === 0) toast.info("No connected directory supports photo push yet.");
      else if (failed > 0) toast.info(`Pushed to ${results.length - failed} of ${results.length} directories.`);
      else toast.success(`Pushed to ${results.length} director${results.length === 1 ? "y" : "ies"}.`);
      void queryClient.invalidateQueries({ queryKey: ["listing-photos"] });
    },
  });

  const invalidateListingConnections = () => {
    void queryClient.invalidateQueries({ queryKey: ["listings-rollup"] });
    void queryClient.invalidateQueries({ queryKey: ["listings-rollup-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["integrations"] });
  };

  // Notifications
  const notify = useCallback((title: string, sub?: string) => {
    setToastMsg({ title, sub });
    setTimeout(() => {
      setToastMsg((cur) => (cur?.title === title ? null : cur));
    }, 5000);
  }, []);

  const closeToast = useCallback(() => {
    setToastMsg(null);
  }, []);

  const openListing = useCallback((item: UnifiedListingItem, section = "Profile") => {
    setSelectedListing(item);
    setActiveLdSection(section);
  }, []);

  const openPanel = useCallback((p: PanelState) => {
    setPanel(p);
  }, []);

  const openConfirm = useCallback((c: ConfirmState) => {
    setConfirm(c);
  }, []);

  const closeOverlays = useCallback(() => {
    setPanel(null);
    setConfirm(null);
    setSelectedListing(null);
  }, []);

  // Location / Platform cycle helpers
  const locationOptions = useMemo(() => {
    const list = ["All locations"];
    if (branches.length > 0) {
      branches.forEach((b) => {
        const name = b.name.includes("branch") ? b.name : `${b.name} branch`;
        if (!list.includes(name)) list.push(name);
      });
    } else {
      list.push("Main branch", "North branch", "Johar Town branch", "Model Town branch");
    }
    return list;
  }, [branches]);

  const platformOptions = useMemo(() => [
    "All platforms",
    "Google Business Profile",
    "Bing Places",
    "Apple Business Connect",
  ], []);

  const cycleLocation = useCallback(() => {
    setLocation((cur) => {
      const idx = locationOptions.indexOf(cur);
      return locationOptions[(idx + 1) % locationOptions.length];
    });
  }, [locationOptions]);

  const cyclePlatform = useCallback(() => {
    setPlatform((cur) => {
      const idx = platformOptions.indexOf(cur);
      return platformOptions[(idx + 1) % platformOptions.length];
    });
  }, [platformOptions]);

  // Unified Listings Generation — real rollup, one row per branch x connected directory
  // provider (see ListingsRollupService on the backend). No fabricated demo data.
  const STATUS_TONE: Record<UnifiedListingItem["status"], UnifiedListingItem["statusTone"]> = {
    Connected: "green",
    "Needs attention": "amber",
    Disconnected: "red",
    "Not connected": "neutral",
  };

  const formatSync = (item: ListingRollupItem): { label: string; tone: UnifiedListingItem["syncTone"] } => {
    if (!item.lastSyncedAt) return { label: "Never synced", tone: "neutral" };
    const when = new Date(item.lastSyncedAt);
    const label = when.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (item.lastSyncStatus === "failed") return { label: `Sync failed ${label}`, tone: "red" };
    return { label: `Synced ${label}`, tone: "green" };
  };

  const listings: UnifiedListingItem[] = useMemo(() => {
    return rollupItems.map((item) => {
      const sync = formatSync(item);
      return {
        id: `${item.branchId}:${item.provider}`,
        branchId: item.branchId,
        provider: item.provider,
        platform: item.providerLabel,
        platformShort: item.providerLabel.split(" ")[0],
        platIcon: "globe",
        business: item.businessName || `${item.branchName} (not set up)`,
        location: item.branchName,
        address: item.address || "Not set",
        phone: item.phone || "Not set",
        category: item.category || "Not set",
        hasMasterListing: item.hasMasterListing,
        status: item.status,
        statusTone: STATUS_TONE[item.status],
        verification: "Not tracked",
        verifyTone: "neutral",
        sync: sync.label,
        syncTone: sync.tone,
        completeness: item.completenessPercent != null ? `${item.completenessPercent}%` : "—",
        completenessPercent: item.completenessPercent,
        photoCount: item.photoCount,
        mismatchedFields: item.mismatchedFields,
        nextAction: item.nextAction,
        nextWhy: item.nextWhy,
      };
    });
  }, [rollupItems]);

  // Filtered listings
  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      if (location !== "All locations" && item.location !== location) return false;
      if (platform !== "All platforms" && item.platform !== platform) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.business.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q) ||
          item.phone.toLowerCase().includes(q) ||
          item.platform.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [listings, location, platform, searchQuery]);

  // Sync confirmation modal — real per-listing state only; the actual push is Noxtill's real
  // `sync()`, which pushes to every connected directory for the branch at once (there's no
  // per-provider selective sync on the backend), so that scope is disclosed rather than implied
  // to be narrower than it is.
  const openSyncPreview = useCallback((o: UnifiedListingItem) => {
    setConfirm({
      title: `Sync ${o.location}'s listings?`,
      tone: "amber",
      icon: "refresh-cw",
      body: `This pushes the ${o.location} Master Record to every directory connected for that location, including ${o.platform}. Nothing is sent until you confirm.`,
      rows: [
        ["Direction", "Noxtill → connected directories"],
        ["Location", o.location],
        [
          "This listing's fields",
          o.mismatchedFields.length > 0
            ? `${o.mismatchedFields.length} field${o.mismatchedFields.length > 1 ? "s" : ""} out of sync: ${o.mismatchedFields.join(", ")}`
            : o.hasMasterListing
            ? "Matches Noxtill's record"
            : "No Master Record set for this location yet",
        ],
        ["Category", o.category],
        ["Affects", "Every connected directory for this location, not just this row"],
      ],
      primary: "Sync now",
      cancel: "Cancel",
      onConfirm: () => {
        syncMutation.mutate(o.branchId);
        notify(`Sync triggered for ${o.location}`, "Results will appear in Sync & Health.");
      },
    });
  }, [syncMutation, notify]);

  // Local presence summary — deterministic, computed live from `listings`/`citations`, not a
  // model call and not scripted text. Every number here traces to a real row.
  const askAI = useCallback((key: string = "attention") => {
    interface AssistantEntry {
      title: string;
      answer: string;
      rows: [string, string, ("pos" | "neg" | "muted" | "neutral")?][];
      bullets: string[];
      note: string;
      primary: string;
    }

    const SEVERITY: Record<UnifiedListingItem["status"], number> = {
      Disconnected: 0,
      "Needs attention": 1,
      "Not connected": 2,
      Connected: 3,
    };
    const needsWork = [...listings]
      .filter((l) => l.status !== "Connected")
      .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
    const readable = listings.filter((l) => l.hasMasterListing && l.status !== "Disconnected");

    const A: Record<string, AssistantEntry> = {
      attention: {
        title: "Which listings need attention?",
        answer:
          needsWork.length === 0
            ? `All ${listings.length} listings across your locations are connected and match your Master Record.`
            : `${needsWork.length} of your ${listings.length} listings need something: ${needsWork.filter((l) => l.status === "Disconnected").length} disconnected, ${needsWork.filter((l) => l.status === "Needs attention").length} with a field mismatch, and ${needsWork.filter((l) => l.status === "Not connected").length} not connected.`,
        rows: needsWork
          .slice(0, 8)
          .map((l) => [
            `${l.location} · ${l.platformShort}`,
            l.status === "Needs attention" ? `Mismatch: ${l.mismatchedFields.join(", ")}` : l.status,
            "neg",
          ]),
        bullets: [
          "Disconnected listings are listed first — Noxtill cannot read or write them until reconnected",
          "Field mismatches are next — a wrong phone or address costs you real customers",
          "Not-connected rows are lowest priority since no listing exists there yet",
          "Every row here is a real status from the connected platform, not a weighted score",
        ],
        note: "There is no duplicate-listing detection in Noxtill today — reviewing for duplicates has to be done on each platform directly.",
        primary: needsWork[0] ? `Open ${needsWork[0].location} · ${needsWork[0].platformShort}` : "Review all listings",
      },
      consistency: {
        title: "Are my business details consistent everywhere?",
        answer:
          readable.length === 0
            ? "No listing is currently both set up and readable, so consistency can't be checked yet."
            : (() => {
                const withMismatch = readable.filter((l) => l.mismatchedFields.length > 0);
                return withMismatch.length === 0
                  ? `All ${readable.length} readable listings match your Master Record on name, phone, address and website.`
                  : `${readable.length - withMismatch.length} of ${readable.length} readable listings match your Master Record. ${withMismatch.length} disagree on at least one field.`;
              })(),
        rows: readable.slice(0, 8).map((l) => [
          `${l.location} · ${l.platformShort}`,
          l.mismatchedFields.length > 0 ? `Mismatch: ${l.mismatchedFields.join(", ")}` : "Matches",
          l.mismatchedFields.length > 0 ? "neg" : "pos",
        ]),
        bullets: [
          "Compared against the last-synced snapshot for each connected directory, field by field",
          "A listing Noxtill cannot currently read is excluded, never assumed to match",
          "Your Master Record for each location is the reference for every comparison",
          "Sync again after fixing a field to clear it from this list",
        ],
        note: "A field Noxtill cannot read is reported as unreadable, never assumed to match.",
        primary: "Open Sync & Health",
      },
      unhealthy: {
        title: "Which listing needs the most work?",
        answer: (() => {
          const withScore = listings.filter((l) => l.completenessPercent != null);
          if (withScore.length === 0) return "No location has a Master Record set up yet, so nothing can be scored.";
          const worst = [...withScore].sort((a, b) => (a.completenessPercent ?? 0) - (b.completenessPercent ?? 0))[0];
          return `${worst.location} · ${worst.platformShort} is the least complete, at ${worst.completenessPercent}%.${worst.mismatchedFields.length > 0 ? ` It also disagrees on: ${worst.mismatchedFields.join(", ")}.` : ""}`;
        })(),
        rows: (() => {
          const withScore = [...listings]
            .filter((l) => l.completenessPercent != null)
            .sort((a, b) => (a.completenessPercent ?? 0) - (b.completenessPercent ?? 0));
          return withScore.slice(0, 8).map((l) => [
            `${l.location} · ${l.platformShort}`,
            `${l.completenessPercent}%`,
            (l.completenessPercent ?? 0) >= 85 ? "pos" : "neg",
          ] as [string, string, "pos" | "neg"]);
        })(),
        bullets: [
          "Completeness counts real name/phone/address/website/description/category/hours/photo fields — nothing weighted or guessed",
          "A field mismatch against the last sync is reported separately, not folded into this score",
          "Fixing the missing fields raises this exact percentage, since it's a direct field count",
          "A location with no Master Record yet is excluded rather than scored as 0%",
        ],
        note: "There is no black-box score anywhere in this module — every percentage is a plain field count.",
        primary: "Open Business Profile",
      },
      duplicates: {
        title: "Find duplicate listings",
        answer:
          "Noxtill does not have duplicate-listing detection today — there's no geo-matching against nearby businesses, so this can't be checked automatically.",
        rows: [
          ["Duplicate detection", "Not available", "neg"],
          ["What Noxtill does check", "Connection status, field mismatches, profile completeness"],
          ["How to check for duplicates", "Search your business name directly on each connected platform"],
        ],
        bullets: [
          "Building this for real would need a geo/name-similarity search against each platform's public listings, which Noxtill doesn't do",
          "Rather than guess at a duplicate, this is disclosed as unavailable",
          "The other three questions above cover what Noxtill can actually check",
        ],
        note: "Noxtill would rather say \"not available\" than invent a duplicate that may not exist.",
        primary: "Close",
      },
    };
    const a = A[key] || A.attention;
    openPanel({
      kicker: "Local presence summary",
      title: a.title,
      badge: "Computed from connected platforms",
      badgeTone: "purple",
      answerLabel: "Answer",
      answer: a.answer,
      rows: a.rows,
      bulletsTitle: "How this was checked",
      bullets: a.bullets,
      note: a.note,
      primary: a.primary,
      secondary: "Close",
    });
  }, [openPanel, listings]);

  const value = {
    currentBranchId,
    location,
    platform,
    searchQuery,
    selectedListing,
    activeLdSection,
    panel,
    confirm,
    toastMsg,

    setLocation,
    setPlatform,
    setSearchQuery,
    setActiveLdSection,
    cycleLocation,
    cyclePlatform,

    openListing,
    openPanel,
    openConfirm,
    closeOverlays,
    notify,
    closeToast,
    openSyncPreview,
    askAI,

    masterListing,
    health,
    syncLog,
    citations,
    liveStatuses,
    branches,
    listingPhotos,
    gmbPhotos,
    gmbPosts,
    reviewsSummary,
    reviews,
    competitors,
    services,
    settings,
    rollupSummary,
    gmbInsights,

    listings,
    filteredListings,
    isMasterLoading,

    syncNow: (branchId?: string) => syncMutation.mutate(branchId),
    isSyncing: syncMutation.isPending,
    updateMaster: async (dto: UpdateMasterListing) => {
      await masterUpdateMutation.mutateAsync(dto);
    },
    updateListingSettingsAction: async (dto: Partial<ListingSettings>) => {
      await settingsMutation.mutateAsync(dto);
    },
    createPostAction: async (dto: { text: string; photoUrl?: string }) => {
      await postCreateMutation.mutateAsync(dto);
    },
    connectListingAction: async (provider: string, branchId: string): Promise<ConnectResult> => {
      const res = await connectIntegration(provider as ConnectorKey, branchId);
      invalidateListingConnections();
      return res;
    },
    disconnectListingAction: async (provider: string, branchId: string) => {
      await disconnectIntegration(provider as ConnectorKey, branchId);
      invalidateListingConnections();
    },
    addPhotoAction: async (dto: { url: string; category: ListingPhotoCategory }) => {
      await addPhotoMutation.mutateAsync(dto);
    },
    removePhotoAction: async (id: string) => {
      await removePhotoMutation.mutateAsync(id);
    },
    pushPhotoAction: (id: string, providers?: string[]) => pushPhotoMutation.mutateAsync({ id, providers }),
    publishPostAction: async (id: string) => {
      await publishPostMutation.mutateAsync(id);
    },
    deletePostAction: async (id: string) => {
      await deletePostMutation.mutateAsync(id);
    },
  };

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>;
}

export function useListings() {
  const ctx = useContext(ListingsContext);
  if (!ctx) {
    throw new Error("useListings must be used within a ListingsProvider");
  }
  return ctx;
}
