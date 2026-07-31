export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export const PROFILE_HEALTH_CHECKLIST: ChecklistItem[] = [
  { key: "hours", label: "Business hours set", done: true },
  { key: "photos", label: "At least 5 photos uploaded", done: true },
  { key: "description", label: "Business description written", done: false },
  { key: "category", label: "Primary category selected", done: true },
  { key: "posts", label: "Posted in the last 30 days", done: false },
];

export interface GmbPost {
  id: string;
  text: string;
  date: string;
  accentColor: string;
}

export const GMB_POSTS: GmbPost[] = [
  { id: "gp1", text: "20% off all color services this weekend only!", date: "2026-07-20", accentColor: "var(--chart-2)" },
  { id: "gp2", text: "We're now open Sundays 10am-4pm.", date: "2026-07-05", accentColor: "var(--chart-1)" },
];

export interface GmbPhoto {
  id: string;
  color: string;
  label: string;
}

export const GMB_PHOTOS: GmbPhoto[] = [
  { id: "ph1", color: "var(--chart-1)", label: "Storefront" },
  { id: "ph2", color: "var(--chart-2)", label: "Interior" },
  { id: "ph3", color: "var(--chart-3)", label: "Team" },
  { id: "ph4", color: "var(--chart-4)", label: "Styling chair" },
  { id: "ph5", color: "var(--chart-5)", label: "Product wall" },
];

export const GMB_INSIGHTS = { views: 2140, searches: 860, calls: 42, directionRequests: 118 };

export interface QnaItem {
  id: string;
  question: string;
  answer?: string;
}

export const GMB_QNA: QnaItem[] = [
  { id: "q1", question: "Do you take walk-ins?", answer: "Yes! Walk-ins welcome, though booking ahead guarantees your stylist." },
  { id: "q2", question: "Is parking available?", answer: "Free parking right behind the building." },
  { id: "q3", question: "Do you do kids' haircuts?" },
];

/** Flip to false to preview the guided create-listing wizard branch. */
export const HAS_LISTING = true;
