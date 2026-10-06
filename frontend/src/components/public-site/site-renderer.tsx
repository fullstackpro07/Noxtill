import type { CSSProperties, ReactNode } from "react";
import type { PublicBlock, PublicNavItem, PublicSiteResponse, Theme } from "@/lib/website-api";
import { onColor } from "@/lib/website-theme";
import { PublicSiteForm } from "./public-site-form";

type OkSite = Extract<PublicSiteResponse, { state: "ok" }>;

const GOOGLE_FONTS = new Set(["Inter", "Poppins", "Lora", "Merriweather", "Roboto"]);

function fontStack(name: string) {
  if (name === "system-ui") return "system-ui, -apple-system, Segoe UI, sans-serif";
  return `"${name}", ${["Georgia", "Lora", "Merriweather"].includes(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;
}

function FontLinks({ theme }: { theme: Theme }) {
  const fonts = [...new Set([theme.fontHeading, theme.fontBody])].filter((f) => GOOGLE_FONTS.has(f));
  if (!fonts.length) return null;
  const href = `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`).join("&")}&display=swap`;
  return <link rel="stylesheet" href={href} />;
}

function Button({ href, label, theme }: { href?: string; label: string; theme: Theme }) {
  if (!href || !label) return null;
  const solid = theme.buttonStyle === "solid";
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      style={{ display: "inline-block", padding: "12px 22px", borderRadius: theme.radius, border: `2px solid ${theme.colors.primary}`, background: solid ? theme.colors.primary : "transparent", color: solid ? onColor(theme.colors.primary) : theme.colors.primary, fontWeight: 600, textDecoration: "none" }}
    >
      {label}
    </a>
  );
}

function Paragraphs({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} style={{ margin: "0 0 12px", whiteSpace: "pre-line", ...style }}>{p}</p>
      ))}
    </>
  );
}

function Section({ children, theme, surface }: { children: ReactNode; theme: Theme; surface?: boolean }) {
  return (
    <section style={{ background: surface ? theme.colors.surface : undefined, padding: "48px 20px" }}>
      <div style={{ maxWidth: theme.layoutWidth, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function H2({ children, theme }: { children: ReactNode; theme: Theme }) {
  if (!children) return null;
  return <h2 style={{ fontFamily: fontStack(theme.fontHeading), fontSize: 28, margin: "0 0 20px" }}>{children}</h2>;
}

function money(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function Block({ block, theme, locale, storeHref, pageId }: { block: PublicBlock; theme: Theme; locale: string; storeHref: string; pageId?: string }) {
  const s = (k: string) => (typeof block[k] === "string" ? (block[k] as string) : "");
  if (block.unavailable) return null;
  switch (block.type) {
    case "hero":
      return (
        <section style={{ padding: "72px 20px", background: theme.colors.surface }}>
          <div style={{ maxWidth: theme.layoutWidth, margin: "0 auto", display: "grid", gap: 28, gridTemplateColumns: s("imageUrl") ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr", alignItems: "center" }}>
            <div>
              <h1 style={{ fontFamily: fontStack(theme.fontHeading), fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.1, margin: "0 0 16px" }}>{s("heading")}</h1>
              {s("subheading") && <p style={{ fontSize: 18, color: theme.colors.muted, margin: "0 0 24px" }}>{s("subheading")}</p>}
              <Button href={s("ctaHref")} label={s("ctaLabel")} theme={theme} />
            </div>
            {s("imageUrl") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s("imageUrl")} alt="" style={{ width: "100%", borderRadius: theme.radius, objectFit: "cover", maxHeight: 420 }} />
            )}
          </div>
        </section>
      );
    case "text":
      return (
        <Section theme={theme}>
          <div style={{ maxWidth: 760 }}>
            <H2 theme={theme}>{s("heading")}</H2>
            <Paragraphs text={s("body")} style={{ fontSize: 17, lineHeight: 1.65 }} />
          </div>
        </Section>
      );
    case "image":
      return (
        <Section theme={theme}>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s("url")} alt={s("alt")} style={{ width: "100%", borderRadius: theme.radius }} />
            {s("caption") && <figcaption style={{ color: theme.colors.muted, fontSize: 14, marginTop: 8 }}>{s("caption")}</figcaption>}
          </figure>
        </Section>
      );
    case "cta":
      return (
        <Section theme={theme} surface>
          <div style={{ textAlign: "center" }}>
            <H2 theme={theme}>{s("heading")}</H2>
            {s("body") && <p style={{ color: theme.colors.muted, margin: "0 0 20px" }}>{s("body")}</p>}
            <Button href={s("href")} label={s("label")} theme={theme} />
          </div>
        </Section>
      );
    case "faq": {
      const items = (Array.isArray(block.items) ? block.items : []) as { q: string; a: string }[];
      return (
        <Section theme={theme}>
          <H2 theme={theme}>{s("heading")}</H2>
          <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
            {items.filter((i) => i.q).map((i, n) => (
              <details key={n} style={{ border: `1px solid ${theme.colors.surface}`, background: theme.colors.surface, borderRadius: theme.radius, padding: "12px 16px" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer" }}>{i.q}</summary>
                <Paragraphs text={i.a} style={{ marginTop: 8, color: theme.colors.muted }} />
              </details>
            ))}
          </div>
        </Section>
      );
    }
    case "products": {
      const products = block.products ?? [];
      return (
        <Section theme={theme}>
          <H2 theme={theme}>{s("heading")}</H2>
          {products.length === 0 ? (
            <p style={{ color: theme.colors.muted }}>No products to show right now.</p>
          ) : (
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {products.map((p) => (
                <article key={p.id} style={{ background: theme.colors.surface, borderRadius: theme.radius, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }} />
                  ) : null}
                  <div style={{ padding: 14, display: "grid", gap: 6 }}>
                    {p.badge && <span style={{ justifySelf: "start", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: theme.colors.accent, color: onColor(theme.colors.accent) }}>{p.badge}</span>}
                    <h3 style={{ margin: 0, fontSize: 17 }}>{p.name}</h3>
                    {p.summary && <p style={{ margin: 0, color: theme.colors.muted, fontSize: 14 }}>{p.summary}</p>}
                    <p style={{ margin: 0, fontWeight: 700 }}>
                      {p.price !== null ? money(p.price, p.currency, locale) : null}
                      {!p.available && <span style={{ marginLeft: 8, fontWeight: 400, color: theme.colors.muted }}>Currently unavailable</span>}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p style={{ marginTop: 20 }}><Button href={storeHref} label="Order online" theme={theme} /></p>
        </Section>
      );
    }
    case "reviews": {
      const reviews = block.reviews ?? [];
      if (!reviews.length) return null;
      return (
        <Section theme={theme} surface>
          <H2 theme={theme}>{s("heading")}</H2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {reviews.map((r, i) => (
              <blockquote key={i} style={{ margin: 0, background: theme.colors.background, borderRadius: theme.radius, padding: 16 }}>
                <p style={{ margin: "0 0 8px" }} aria-label={`${r.stars} out of 5 stars`}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</p>
                <p style={{ margin: "0 0 8px" }}>{r.text}</p>
                <footer style={{ color: theme.colors.muted, fontSize: 14 }}>{r.author} · {r.platform}</footer>
              </blockquote>
            ))}
          </div>
        </Section>
      );
    }
    case "contact": {
      const c = block.contact;
      if (!c || (!c.phone && !c.address)) return null;
      return (
        <Section theme={theme}>
          <H2 theme={theme}>{s("heading")}</H2>
          <address style={{ fontStyle: "normal", display: "grid", gap: 6, fontSize: 17 }}>
            {c.phone && <a href={`tel:${c.phone}`} style={{ color: theme.colors.primary }}>{c.phone}</a>}
            {c.address && <span style={{ whiteSpace: "pre-line" }}>{c.address}</span>}
          </address>
        </Section>
      );
    }
    case "form":
      if (!block.form) return null;
      return (
        <Section theme={theme}>
          <H2 theme={theme}>{s("heading")}</H2>
          <PublicSiteForm form={block.form} pageId={pageId} primary={theme.colors.primary} radius={theme.radius} />
        </Section>
      );
    case "booking":
      return (
        <Section theme={theme} surface>
          <H2 theme={theme}>{s("heading")}</H2>
          {s("body") && <p style={{ color: theme.colors.muted, margin: "0 0 20px" }}>{s("body")}</p>}
          <Button href={block.href} label={s("ctaLabel") || "Book now"} theme={theme} />
        </Section>
      );
    default:
      return null;
  }
}

function NavLink({ item, color }: { item: PublicNavItem; color: string }) {
  if (!item.href) return <span>{item.label}</span>;
  return (
    <a href={item.href} {...(item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} style={{ color, textDecoration: "none" }}>
      {item.label}
    </a>
  );
}

export function SiteShell({ data, slug, children }: { data: OkSite; slug: string; children: ReactNode }) {
  const t = data.theme;
  const headerBg = t.headerStyle === "dark" ? "#111827" : t.headerStyle === "brand" ? t.colors.primary : t.colors.background;
  const headerFg = t.headerStyle === "light" ? t.colors.text : t.headerStyle === "brand" ? onColor(t.colors.primary) : "#ffffff";
  return (
    <div style={{ minHeight: "100vh", background: t.colors.background, color: t.colors.text, fontFamily: fontStack(t.fontBody), display: "flex", flexDirection: "column" }}>
      <FontLinks theme={t} />
      <a href="#main" style={{ position: "absolute", left: -9999 }}>Skip to content</a>
      <header style={{ background: headerBg, color: headerFg, borderBottom: `1px solid ${t.colors.surface}` }}>
        <div style={{ maxWidth: t.layoutWidth, margin: "0 auto", padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <a href={data.site.homeHref} style={{ color: headerFg, textDecoration: "none", display: "flex", alignItems: "center", gap: 10, fontFamily: fontStack(t.fontHeading), fontWeight: 700, fontSize: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.logoUrl ? <img src={t.logoUrl} alt="" style={{ height: 36 }} /> : null}
            {data.site.name}
          </a>
          <nav aria-label="Main">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 18 }}>
              {data.navigation.header.map((item, i) => (
                <li key={i} style={{ position: "relative" }}>
                  {item.children?.length ? (
                    <details>
                      <summary style={{ cursor: "pointer" }}>{item.label}</summary>
                      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 10, background: t.colors.background, color: t.colors.text, borderRadius: t.radius, position: "absolute", zIndex: 10, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                        {item.href && <li style={{ padding: 4 }}><NavLink item={item} color={t.colors.text} /></li>}
                        {item.children.map((c, j) => <li key={j} style={{ padding: 4 }}><NavLink item={c} color={t.colors.text} /></li>)}
                      </ul>
                    </details>
                  ) : (
                    <NavLink item={item} color={headerFg} />
                  )}
                </li>
              ))}
              {data.site.searchHref && <li><a href={data.site.searchHref} style={{ color: headerFg }}>Search</a></li>}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" style={{ flex: 1 }}>{children}</main>
      <footer style={{ background: t.colors.surface, padding: "28px 20px", fontSize: 14 }}>
        <div style={{ maxWidth: t.layoutWidth, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between" }}>
          <span>© {data.site.name}{data.site.tagline ? ` · ${data.site.tagline}` : ""}</span>
          <nav aria-label="Footer">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 14 }}>
              {data.navigation.footer.flatMap((i) => [i, ...(i.children ?? [])]).map((item, i) => <li key={i}><NavLink item={item} color={t.colors.text} /></li>)}
              <li><a href={`/store/${slug}`} style={{ color: t.colors.text }}>Store</a></li>
            </ul>
          </nav>
        </div>
      </footer>
      {data.site.cookieBanner && (
        <div role="region" aria-label="Cookie notice" style={{ position: "sticky", bottom: 0, background: t.colors.text, color: t.colors.background, padding: "10px 20px", fontSize: 14 }}>
          {data.site.cookieBanner.text} {data.site.cookieBanner.privacyHref && <a href={data.site.cookieBanner.privacyHref} style={{ color: t.colors.background, textDecoration: "underline" }}>Privacy policy</a>}
        </div>
      )}
    </div>
  );
}

export function SiteView({ data, slug }: { data: OkSite; slug: string }) {
  const t = data.theme;
  const v = data.view;
  const storeHref = `/store/${slug}`;
  const blocks = (list: PublicBlock[], pageId?: string) => list.map((b) => <Block key={b.id} block={b} theme={t} locale={data.site.locale} storeHref={storeHref} pageId={pageId} />);
  let body: ReactNode;
  if (v.type === "page") {
    body = blocks(v.blocks, v.pageId);
  } else if (v.type === "post") {
    body = (
      <article>
        <Section theme={t}>
          <div style={{ maxWidth: 760 }}>
            {v.category && <p style={{ color: t.colors.primary, fontWeight: 600, margin: "0 0 8px" }}>{v.category}</p>}
            <h1 style={{ fontFamily: fontStack(t.fontHeading), fontSize: "clamp(30px, 4vw, 44px)", margin: "0 0 10px" }}>{v.title}</h1>
            <p style={{ color: t.colors.muted, margin: 0 }}>{new Date(v.publishedAt).toLocaleDateString(data.site.locale, { dateStyle: "long" })}</p>
            {v.heroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.heroImageUrl} alt="" style={{ width: "100%", borderRadius: t.radius, marginTop: 20 }} />
            )}
          </div>
        </Section>
        {blocks(v.blocks, v.pageId)}
        {v.tags.length > 0 && <Section theme={t}><p style={{ color: t.colors.muted }}>Tags: {v.tags.join(", ")}</p></Section>}
      </article>
    );
  } else if (v.type === "blog_index") {
    body = (
      <Section theme={t}>
        <h1 style={{ fontFamily: fontStack(t.fontHeading), fontSize: 40, margin: "0 0 24px" }}>Blog</h1>
        {v.posts.length === 0 ? <p style={{ color: t.colors.muted }}>No posts yet.</p> : (
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {v.posts.map((p) => (
              <a key={p.slug} href={`/site/${slug}/blog/${p.slug}`} style={{ color: "inherit", textDecoration: "none", background: t.colors.surface, borderRadius: t.radius, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.heroImageUrl ? <img src={p.heroImageUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }} /> : null}
                <div style={{ padding: 16 }}>
                  <p style={{ margin: "0 0 6px", color: t.colors.muted, fontSize: 13 }}>{new Date(p.publishedAt).toLocaleDateString(data.site.locale)}{p.category ? ` · ${p.category}` : ""}</p>
                  <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{p.title}</h2>
                  {p.excerpt && <p style={{ margin: 0, color: t.colors.muted }}>{p.excerpt}</p>}
                </div>
              </a>
            ))}
          </div>
        )}
      </Section>
    );
  } else if (v.type === "search") {
    body = (
      <Section theme={t}>
        <h1 style={{ fontFamily: fontStack(t.fontHeading), fontSize: 36, margin: "0 0 16px" }}>Search</h1>
        <form method="get" role="search" style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <label htmlFor="site-search" style={{ position: "absolute", left: -9999 }}>Search this site</label>
          <input id="site-search" name="q" defaultValue={v.query} style={{ flex: 1, maxWidth: 420, padding: "10px 12px", borderRadius: t.radius, border: "1px solid rgba(127,127,127,.45)", background: "transparent", color: "inherit" }} />
          <button type="submit" style={{ padding: "10px 16px", borderRadius: t.radius, border: 0, background: t.colors.primary, color: onColor(t.colors.primary) }}>Search</button>
        </form>
        {v.query && (v.results.length === 0 ? <p style={{ color: t.colors.muted }}>No results for “{v.query}”.</p> : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 14 }}>
            {v.results.map((r) => <li key={r.path}><a href={r.path} style={{ color: t.colors.primary, fontSize: 18 }}>{r.title}</a>{r.excerpt && <p style={{ margin: "4px 0 0", color: t.colors.muted }}>{r.excerpt}</p>}</li>)}
          </ul>
        ))}
      </Section>
    );
  } else {
    body = v.blocks.length ? blocks(v.blocks) : (
      <Section theme={t}>
        <h1 style={{ fontFamily: fontStack(t.fontHeading) }}>Page not found</h1>
        <p style={{ color: t.colors.muted }}>This page doesn&rsquo;t exist or was moved. <a href={data.site.homeHref} style={{ color: t.colors.primary }}>Go to the home page</a>.</p>
      </Section>
    );
  }
  return <SiteShell data={data} slug={slug}>{body}</SiteShell>;
}
