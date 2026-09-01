"use client";

import { useMemo, useState } from "react";
import { Check, Copy, MessageSquareQuote, RefreshCw, Star } from "lucide-react";

const inputClass =
  "h-11 w-full rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

type Tier = "great" | "good" | "mixed" | "poor";

function tierFor(rating: number): Tier {
  if (rating >= 5) return "great";
  if (rating === 4) return "good";
  if (rating === 3) return "mixed";
  return "poor";
}

function buildReplies(tier: Tier, name: string, point: string, business: string): string[] {
  const who = name.trim() || "there";
  const what = point.trim() || "your visit";
  const biz = business.trim() || "our team";

  if (tier === "great") {
    return [
      `Thank you so much, ${who}! We're thrilled ${what.toLowerCase()} stood out for you — it means a lot to hear. Looking forward to seeing you again soon!`,
      `${who}, this made our day — thank you! We're so glad ${what.toLowerCase()} hit the mark. Can't wait to welcome you back.`,
    ];
  }
  if (tier === "good") {
    return [
      `Thanks for the kind words, ${who}! We're really glad ${what.toLowerCase()} worked out well. If there's ever anything we can do to make your next visit a five-star one, just let us know.`,
      `Thank you, ${who} — we appreciate you taking the time to share this. Glad ${what.toLowerCase()} was a highlight, and we'd love to see you again soon.`,
    ];
  }
  if (tier === "mixed") {
    return [
      `Thanks for the honest feedback, ${who}. We hear you on ${what.toLowerCase()}, and we'd love the chance to do better next time — feel free to reach out directly so we can make it right.`,
      `${who}, we appreciate you sharing this. ${what} is exactly the kind of feedback that helps us improve — hope you'll give us another chance to earn that fifth star.`,
    ];
  }
  return [
    `${who}, we're sorry to hear about ${what.toLowerCase()} — that's not the experience we want anyone to have. Please reach out to ${biz} directly so we can make this right.`,
    `We're really sorry, ${who}. ${what} isn't the standard we hold ourselves to, and we'd like the chance to fix it. Please get in touch with ${biz} directly — we want to make this right.`,
  ];
}

export function ReviewResponseGeneratorTool() {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [point, setPoint] = useState("");
  const [business, setBusiness] = useState("");
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);

  const tier = tierFor(rating);
  const replies = useMemo(() => buildReplies(tier, name, point, business), [tier, name, point, business]);
  const reply = replies[variant % replies.length];

  function copy() {
    navigator.clipboard?.writeText(reply).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
          <MessageSquareQuote className="h-4.5 w-4.5 text-accent" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold text-fg">Generate a reply</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Customer name (optional)</span>
          <input type="text" className={inputClass} placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Star rating</span>
          <div className="flex h-11 items-center gap-1 rounded-[10px] border border-border-strong bg-surface-2 px-3.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <Star className={`h-[18px] w-[18px] ${n <= rating ? "fill-[#f5a623] text-[#f5a623]" : "text-border-strong"}`} aria-hidden />
              </button>
            ))}
          </div>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[12.5px] font-medium text-fg">What did they mention?</span>
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. loved the haircut, or had to wait 20 minutes"
            value={point}
            onChange={(e) => setPoint(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[12.5px] font-medium text-fg">Your business name (optional)</span>
          <input type="text" className={inputClass} placeholder="e.g. Bloom Salon" value={business} onChange={(e) => setBusiness(e.target.value)} />
        </label>
      </div>

      <div className="mt-6 rounded-xl border border-[#d5eee2] bg-[#f7fdfa] p-4">
        <p className="text-[14px] leading-relaxed text-[#1e3138]">{reply}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy reply"}
        </button>
        <button
          type="button"
          onClick={() => setVariant((v) => v + 1)}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong px-4 py-2.5 text-[13.5px] font-medium text-fg hover:border-primary hover:text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try another version
        </button>
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-faint">
        Noxtill drafts a reply like this automatically for every new review — see{" "}
        <a href="/product/reviews" className="text-primary hover:underline">
          Reviews &amp; Reputation
        </a>
        .
      </p>
    </div>
  );
}
