import { WidgetCard } from "./widget-card";
import { widgetByKey, getMockWidgetData } from "@/lib/widgets";

/** 4-across on desktop, 2 on mobile (FE-007). */
export function WidgetGridView({ layout, currency }: { layout: string[]; currency: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {layout.map((key) => {
        const widget = widgetByKey(key);
        if (!widget) return null;
        return <WidgetCard key={key} widget={widget} data={getMockWidgetData(key)} currency={currency} />;
      })}
    </div>
  );
}
