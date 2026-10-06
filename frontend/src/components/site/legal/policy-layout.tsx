"use client";

import { useState, type ReactNode } from "react";
import { s } from "./s";
import { jumpTo, useFocusTrap, useNarrow, useScrollSpy } from "./use-legal";

export interface TocItem {
  id: string;
  num: string;
  title: string;
}

type Variant = "terms" | "privacy";

/**
 * Two-column policy layout: sticky contents with scroll-spy on wide screens, a fixed "Contents"
 * button + bottom-sheet drawer below 980px (legal-terms / legal-privacy .dc.html).
 */
export function PolicyLayout({
  items,
  variant,
  navLabel,
  heading,
  drawerId,
  padding,
  children,
}: {
  items: TocItem[];
  variant: Variant;
  navLabel: string;
  heading: string;
  drawerId: string;
  padding: string;
  children: ReactNode;
}) {
  const narrow = useNarrow(980);
  const active = useScrollSpy(items.map((i) => i.id));
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useFocusTrap(drawer, () => setDrawer(false));
  const close = () => setDrawer(false);
  const activeItem = items.find((i) => i.id === active);

  return (
    <>
      <div style={s(`max-width: 1240px; margin: 0 auto; padding: ${padding}; display: flex; flex-wrap: wrap; gap: 48px; align-items: flex-start;`)}>
        {!narrow ? (
          variant === "terms" ? (
            <nav
              aria-label={navLabel}
              style={s("flex: 0 0 270px; position: sticky; top: 122px; max-height: calc(100vh - 140px); overflow: auto; padding-right: 6px;")}
              data-noprint="true"
            >
              <p style={s("margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5B63;")}>{heading}</p>
              <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px;")}>
                {items.map((t) => {
                  const on = t.id === active;
                  return (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        onClick={jumpTo(t.id)}
                        aria-current={on ? "true" : undefined}
                        className="h-mint"
                        style={s(
                          `display: flex; gap: 10px; padding: 7px 10px; border-radius: 8px; font-size: 14px; line-height: 1.35; text-decoration: none; color: ${on ? "#043F31" : "#3A4A52"}; background: ${on ? "#ECFBF4" : "transparent"}; font-weight: ${on ? 700 : 500}; transition: background .15s;`,
                        )}
                      >
                        <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; min-width: 22px; color: #067A50; padding-top: 1px;")}>{t.num}</span>
                        <span>{t.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : (
            <nav aria-label={navLabel} style={s("flex: 0 0 260px; position: sticky; top: 122px; max-height: calc(100vh - 140px); overflow: auto;")} data-noprint="true">
              <p style={s("margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5B63;")}>{heading}</p>
              <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; border-left: 2px solid #E3EEE8;")}>
                {items.map((t) => {
                  const on = t.id === active;
                  return (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        onClick={jumpTo(t.id)}
                        aria-current={on ? "true" : undefined}
                        className="h-ink"
                        style={s(
                          `display: block; margin-left: -2px; padding: 7px 12px; border-left: 2px solid ${on ? "#079A63" : "transparent"}; font-size: 14px; line-height: 1.35; text-decoration: none; color: ${on ? "#043F31" : "#3A4A52"}; font-weight: ${on ? 700 : 500};`,
                        )}
                      >
                        {t.num}. {t.title}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )
        ) : null}
        {children}
      </div>

      {narrow ? (
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-haspopup="dialog"
          aria-expanded={variant === "terms" ? drawer : undefined}
          style={s(
            "position: fixed; left: 50%; transform: translateX(-50%); bottom: 18px; z-index: 40; height: 48px; padding: 0 22px; border-radius: 999px; border: 0; background: #064F3B; color: #FFFFFF; font: 700 15px 'Plus Jakarta Sans', sans-serif; box-shadow: 0 10px 30px rgba(4,63,49,0.35); cursor: pointer;",
          )}
          data-noprint="true"
        >
          {variant === "terms" ? `Contents · ${activeItem ? `§ ${activeItem.num}` : "Sections"}` : "Contents"}
        </button>
      ) : null}
      {drawer ? (
        <div style={s("position: fixed; inset: 0; z-index: 70; background: rgba(4,30,24,0.45); display: flex; align-items: flex-end;")} onClick={close} data-noprint="true">
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerId}
            onClick={(e) => e.stopPropagation()}
            style={s("width: 100%; max-height: 78vh; overflow: auto; background: #FFFFFF; border-radius: 20px 20px 0 0; padding: 18px 18px 28px;")}
          >
            <div style={s("display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;")}>
              <h2 id={drawerId} style={s("margin: 0; font-size: 18px; font-weight: 800;")}>
                {heading === "Contents" ? "Contents" : heading.replace(/^./, (c) => c.toUpperCase())}
              </h2>
              <button
                type="button"
                onClick={close}
                style={s("height: 44px; min-width: 44px; border-radius: 10px; border: 1px solid #D9E8E0; background: #FFFFFF; font: 600 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
              >
                Close
              </button>
            </div>
            <ol style={s("list-style: none; margin: 0; padding: 0;")}>
              {items.map((t) => {
                const on = t.id === active;
                return (
                  <li key={t.id}>
                    {variant === "terms" ? (
                      <a
                        href={`#${t.id}`}
                        onClick={jumpTo(t.id, close)}
                        aria-current={on ? "true" : undefined}
                        style={s(
                          `display: flex; gap: 12px; padding: 12px 8px; min-height: 44px; box-sizing: border-box; font-size: 16px; text-decoration: none; color: #0B1822; border-bottom: 1px solid #EEF4F1; font-weight: ${on ? 700 : 500};`,
                        )}
                      >
                        <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #067A50; min-width: 26px; padding-top: 2px;")}>{t.num}</span>
                        {t.title}
                      </a>
                    ) : (
                      <a
                        href={`#${t.id}`}
                        onClick={jumpTo(t.id, close)}
                        style={s("display: block; padding: 12px 8px; min-height: 44px; box-sizing: border-box; font-size: 16px; text-decoration: none; color: #0B1822; border-bottom: 1px solid #EEF4F1;")}
                      >
                        {t.num}. {t.title}
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
