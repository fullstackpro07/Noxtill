import { STATS } from "@/lib/landing-content";

export function StatsBar() {
  return (
    <section className="bg-primary py-10">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 sm:grid-cols-4 sm:px-6">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="font-display text-3xl font-bold text-accent">{stat.value}</p>
            <p className="mt-1 text-xs text-primary-foreground/70">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
