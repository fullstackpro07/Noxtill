export type Tone = "green" | "amber" | "red" | "blue" | "purple" | "neutral";

export interface PanelConfig {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  answer?: string;
  answerLabel?: string;
  rows?: Array<[string, string] | [string, string, "pos" | "neg" | "muted" | undefined]>;
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
  /** Label of the primary button; omit `onPrimary` to make it simply close the panel. */
  primary?: string;
  primaryTone?: "red" | "green";
  onPrimary?: () => void;
  secondary?: string;
  onSecondary?: () => void;
}

export interface ConfirmConfig {
  title: string;
  body: string;
  tone?: "red" | "amber" | "green";
  icon?: string;
  rows?: Array<[string, string] | [string, string, "pos" | "neg" | undefined]>;
  primary?: string;
  cancel?: string;
  /** Awaited; the dialog stays open and shows a spinner while it runs, and closes when it resolves. */
  onConfirm: () => void | Promise<unknown>;
}
