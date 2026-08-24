"use client";

import { Card, CardContent } from "@/components/ui/card";
import { WidgetGenerator } from "./widget-generator";

export function ReviewWidgetPanel({ businessSlug }: { businessSlug: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <WidgetGenerator businessSlug={businessSlug} />
      </CardContent>
    </Card>
  );
}
