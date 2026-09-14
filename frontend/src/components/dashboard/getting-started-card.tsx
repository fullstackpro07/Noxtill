import Link from "next/link";

const btnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 9,
  padding: "7px 12px",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
};

/** Static shortcuts to real setup routes — no fabricated "demo workspace" framing since this is a real account. */
export function GettingStartedCard() {
  return (
    <section className="rounded-[14px] p-[16px_18px]" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Getting started</span>
        <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Finish setting up your workspace</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <Link href="/products" style={btnStyle}>Add your first product</Link>
          <Link href="/bookings/link" style={btnStyle}>Create booking link</Link>
          <Link href="/reviews/requests" style={btnStyle}>Send review request</Link>
        </div>
      </div>
    </section>
  );
}
