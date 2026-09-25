"use client";

import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CalendarCheck,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CopyCheck,
  CreditCard,
  Crop,
  FileInput,
  FileOutput,
  FileSpreadsheet,
  FileText,
  Files,
  Filter,
  Gauge,
  History,
  Info,
  Layers,
  Loader,
  ListChecks,
  LockKeyhole,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  RotateCw,
  ScanLine,
  ScanText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
  UsersRound,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

const ICONS: Record<string, LucideIcon> = {
  "scan-text": ScanText,
  camera: Camera,
  files: Files,
  "list-checks": ListChecks,
  "table-2": Table2,
  "file-input": FileInput,
  "file-output": FileOutput,
  history: History,
  sparkles: Sparkles,
  "settings-2": Settings2,
  gauge: Gauge,
  upload: Upload,
  "rotate-cw": RotateCw,
  crop: Crop,
  "scan-line": ScanLine,
  "triangle-alert": TriangleAlert,
  "copy-check": CopyCheck,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "check-check": CheckCheck,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  pencil: Pencil,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  boxes: Boxes,
  "credit-card": CreditCard,
  receipt: Receipt,
  "trash-2": Trash2,
  "lock-keyhole": LockKeyhole,
  "users-round": UsersRound,
  "user-round": UserRound,
  package: Package,
  search: Search,
  filter: Filter,
  "shield-check": ShieldCheck,
  info: Info,
  check: Check,
  x: X,
  "chevron-down": ChevronDown,
  "refresh-cw": RefreshCw,
  "book-open": BookOpen,
  layers: Layers,
  "alert-triangle": AlertTriangle,
  "calendar-check": CalendarCheck,
  loader: Loader,
  plus: Plus,
};

export function DigitizerIcon({
  name,
  size = 16,
  strokeWidth = 1.75,
  className,
  style,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const IconComp = ICONS[name] || FileText;
  return (
    <IconComp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{ width: size, height: size, flexShrink: 0, display: "block", ...style }}
      aria-hidden="true"
    />
  );
}
