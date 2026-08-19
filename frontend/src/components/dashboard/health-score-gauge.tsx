const RADIUS = 64;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score: number): string {
  if (score >= 70) return "var(--chart-good)";
  if (score >= 40) return "var(--chart-warning)";
  return "var(--chart-critical)";
}

export function HealthScoreGauge({ score }: { score: number }) {
  const fraction = Math.max(0, Math.min(100, score)) / 100;
  const arcLength = fraction * CIRCUMFERENCE;
  const color = scoreColor(score);

  return (
    <div className="relative shrink-0" style={{ width: 152, height: 152 }}>
      <svg width={152} height={152} viewBox="0 0 152 152" role="img" aria-label={`Business health score: ${score} out of 100`}>
        <circle cx={76} cy={76} r={RADIUS} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
        <circle
          cx={76}
          cy={76}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${arcLength} ${CIRCUMFERENCE - arcLength}`}
          strokeLinecap="round"
          transform="rotate(-90 76 76)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-3xl font-bold tabular-nums text-fg">{Math.round(score)}</p>
        <p className="text-xs text-fg-faint">out of 100</p>
      </div>
    </div>
  );
}
