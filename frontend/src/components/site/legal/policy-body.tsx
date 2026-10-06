import type { VisibleSection } from "@/lib/marketing/legal/nox";
import { s } from "./s";

/** Anchored, numbered policy sections — docs/Legal pages/PolicyBody.dc.html. */
export function PolicyBody({ sections, compact }: { sections: VisibleSection[]; compact?: boolean }) {
  const hSize = compact ? "19px" : "22px";
  return (
    <div style={s("display: flex; flex-direction: column; gap: 8px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #1C2B33;")}>
      {sections.map((sec) => (
        <section
          key={sec.id}
          id={sec.id}
          aria-labelledby={`${sec.id}-h`}
          style={s("scroll-margin-top: 96px; padding: 28px 0 20px; border-top: 1px solid #E3EEE8;")}
          data-policy-section="true"
        >
          <h2
            id={`${sec.id}-h`}
            style={s(
              `margin: 0 0 14px; font-size: ${hSize}; line-height: 1.3; font-weight: 750; letter-spacing: -0.01em; color: #0B1822; display: flex; gap: 12px; align-items: baseline; text-wrap: balance;`,
            )}
          >
            {sec.num ? (
              <span style={s("font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 15px; font-weight: 600; color: #067A50; min-width: 34px;")}>{sec.num}</span>
            ) : null}
            <span style={s("flex: 1; min-width: 0;")}>{sec.title}</span>
            <a
              href={`#${sec.id}`}
              aria-label={`Link to section: ${sec.title}`}
              className="h-mint-ink"
              style={s("font-size: 14px; font-weight: 600; color: #4C5B63; text-decoration: none; padding: 4px 6px; border-radius: 6px;")}
              data-noprint="true"
            >
              #
            </a>
          </h2>
          <div style={s("display: flex; flex-direction: column; gap: 14px; max-width: 74ch;")}>
            {sec.blocks.map((b, i) => {
              if (b.isUl)
                return (
                  <ul key={i} style={s("margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; font-size: 17px; line-height: 1.65;")}>
                    {(b.items ?? []).map((it, j) => (
                      <li key={j} style={s("padding-left: 4px;")}>
                        {it}
                      </li>
                    ))}
                  </ul>
                );
              if (b.isQuote)
                return (
                  <blockquote key={i} style={s("margin: 0; padding: 16px 20px; background: #ECFBF4; border-radius: 12px; font-size: 17px; line-height: 1.6; color: #0B1822; font-weight: 500;")}>
                    {b.x}
                  </blockquote>
                );
              if (b.isNote)
                return (
                  <p key={i} style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #4C5B63; padding: 12px 16px; border: 1px dashed #C9DAD1; border-radius: 10px; background: #F7FAF8;")}>
                    {b.x}
                  </p>
                );
              return (
                <p key={i} style={s("margin: 0; font-size: 17px; line-height: 1.72; text-wrap: pretty;")}>
                  {b.x}
                </p>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
