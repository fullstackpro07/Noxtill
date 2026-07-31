export function TypingDots({ tone = "neutral" }: { tone?: "neutral" | "inverted" }) {
  const dot = tone === "inverted" ? "bg-primary-foreground/70" : "bg-fg-faint";
  return (
    <span className="flex items-center gap-1 px-1 py-1.5">
      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dot}`} style={{ animationDelay: "0ms" }} />
      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dot}`} style={{ animationDelay: "180ms" }} />
      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dot}`} style={{ animationDelay: "360ms" }} />
    </span>
  );
}
