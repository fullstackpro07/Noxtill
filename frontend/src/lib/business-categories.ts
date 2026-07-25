import type { LucideIcon } from "lucide-react";
import {
  Utensils,
  ShoppingBag,
  Scissors,
  Briefcase,
  Wrench,
  Car,
  GraduationCap,
  Dumbbell,
  PartyPopper,
  Home,
  Cpu,
  MoreHorizontal,
} from "lucide-react";

export interface BusinessCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  examples: string;
}

/** 12 category cards (FE-005) — mirrors the categories BusinessTypesSeedService seeds on the backend (BE-069). */
export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { key: "food_beverage", label: "Food & Beverage", icon: Utensils, examples: "Restaurant, cafe, bakery" },
  { key: "retail", label: "Retail", icon: ShoppingBag, examples: "Clothing, grocery, electronics" },
  { key: "health_beauty", label: "Health & Beauty", icon: Scissors, examples: "Salon, spa, barbershop" },
  { key: "services", label: "Professional Services", icon: Briefcase, examples: "Consultancy, agency" },
  { key: "home_services", label: "Home Services", icon: Wrench, examples: "Repair, cleaning, plumbing" },
  { key: "automotive", label: "Automotive", icon: Car, examples: "Garage, car wash, rentals" },
  { key: "education", label: "Education", icon: GraduationCap, examples: "Tutoring, academy" },
  { key: "fitness", label: "Fitness & Wellness", icon: Dumbbell, examples: "Gym, yoga studio" },
  { key: "events", label: "Events & Entertainment", icon: PartyPopper, examples: "Venue, planner, studio" },
  { key: "real_estate", label: "Real Estate", icon: Home, examples: "Agency, property management" },
  { key: "technology", label: "Technology", icon: Cpu, examples: "Repair shop, IT services" },
  { key: "other", label: "Other", icon: MoreHorizontal, examples: "Something else entirely" },
];
