import { MarketingFaqGrid } from "@/components/site/marketing-faq-grid";
import { HOME_FAQ_ITEMS } from "@/lib/marketing/home-content";

export function FaqSection() {
  return (
    <div className="bg-surface-tint">
      <MarketingFaqGrid
        title="Frequently asked questions"
        description="What Noxtill is, how the nightly close works, and what happens to your data."
        items={HOME_FAQ_ITEMS}
      />
    </div>
  );
}
