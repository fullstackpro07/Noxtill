import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Dashboard</h1>
          <p className="mt-1 text-sm text-fg-muted">
            The shell is live — widgets and real numbers land in Module 1.
          </p>
        </div>
        <Badge tone="success">Shell verified</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Today's Revenue", "Orders Today", "Upcoming Appointments"].map((title, i) => (
          <Card key={title} className="animate-stagger-in" style={{ animationDelay: `${i * 60}ms` }}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="skeleton-shimmer h-8 w-24 rounded-[var(--radius-sm)]" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
