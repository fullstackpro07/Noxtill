"use client";

import { useEffect } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The inline <script>s in the designs' <helmet> (and the blog pages' TOC logic), ported verbatim and
 * made unmount-safe. Which ones a page runs is recorded by the converter in `page.effects`.
 */
type Cleanup = () => void;

function every300(fn: () => void): Cleanup {
  let n = 0;
  const t = setInterval(() => {
    fn();
    if (++n > 24) clearInterval(t);
  }, 300);
  return () => clearInterval(t);
}

/** Non-production hosts must not be indexed. */
function robots(): Cleanup {
  const h = location.hostname;
  if (h !== "noxtill.com" && h !== "www.noxtill.com") {
    const m = document.querySelector('meta[name="robots"]');
    if (m) m.setAttribute("content", "noindex,nofollow");
  }
  return () => {};
}

/** [data-nx-scale]: scale a fixed-width product mock down to its column. */
function scale(): Cleanup {
  const ros: ResizeObserver[] = [];
  function sc() {
    document.querySelectorAll<HTMLElement>("[data-nx-scale]").forEach((el: any) => {
      const d = +el.getAttribute("data-nx-scale"),
        inn = el.firstElementChild as HTMLElement | null;
      if (!inn) return;
      const w = el.clientWidth;
      if (!w) return;
      const s = Math.min(1, w / d);
      inn.style.width = (s < 1 ? d : w) + "px";
      el.style.setProperty("--k", s.toFixed(4));
      el.style.height = Math.ceil(inn.scrollHeight * s) + "px";
      if (!el.__ro && window.ResizeObserver) {
        el.__ro = new ResizeObserver(sc);
        el.__ro.observe(el);
        ros.push(el.__ro);
      }
    });
  }
  const stop = every300(sc);
  window.addEventListener("resize", sc);
  sc();
  return () => {
    stop();
    window.removeEventListener("resize", sc);
    ros.forEach((r) => r.disconnect());
  };
}

function fitAll(ros: ResizeObserver[]) {
  document.querySelectorAll<HTMLElement>("[data-nx-fit]").forEach((el: any) => {
    const d = +el.getAttribute("data-nx-fit");
    const inner = el.querySelector(".nx-fit-inner") as HTMLElement | null;
    if (!inner) return;
    const box = inner.firstElementChild as HTMLElement | null,
      cont = box && (box.firstElementChild as HTMLElement | null);
    if (!box || !cont) return;
    let w = d;
    for (let i = 0; i < 6; i++) {
      inner.style.width = w + "px";
      cont.style.width = w + "px";
      inner.style.height = "auto";
      box.style.height = "auto";
      cont.style.height = "auto";
      const ch = cont.scrollHeight;
      const nw = Math.max(d, Math.ceil(ch * 1.6));
      if (Math.abs(nw - w) < 4) {
        w = nw;
        break;
      }
      w = nw;
    }
    inner.style.width = w + "px";
    cont.style.width = w + "px";
    inner.style.height = Math.round(w / 1.6) + "px";
    box.style.height = "";
    cont.style.height = "";
    const ew = el.clientWidth;
    if (ew) el.style.setProperty("--s", (ew / w).toFixed(4));
    if (!el.__ro && window.ResizeObserver) {
      el.__ro = new ResizeObserver(() => {
        const ew2 = el.clientWidth;
        if (ew2) el.style.setProperty("--s", (ew2 / parseFloat(inner.style.width)).toFixed(4));
      });
      el.__ro.observe(el);
      ros.push(el.__ro);
    }
  });
}

/** [data-nx-fit]: lay a mock out at a 1.6 aspect and scale it into its frame. */
function fit(): Cleanup {
  const ros: ResizeObserver[] = [];
  const run = () => fitAll(ros);
  const stop = every300(run);
  window.addEventListener("load", run);
  run();
  return () => {
    stop();
    window.removeEventListener("load", run);
    ros.forEach((r) => r.disconnect());
  };
}

/** Blog variant: fit, plus a simpler [data-nx-scale] pass, also on resize. */
function fitScaleBlog(): Cleanup {
  const ros: ResizeObserver[] = [];
  const run = () => {
    fitAll(ros);
    document.querySelectorAll<HTMLElement>("[data-nx-scale]").forEach((el) => {
      const m = +(el.getAttribute("data-nx-scale") || 0);
      const w = el.clientWidth;
      const k = Math.min(1, w / m);
      el.style.setProperty("--k", k.toFixed(4));
      const c = el.firstElementChild as HTMLElement | null;
      if (c) el.style.height = c.offsetHeight * k + "px";
    });
  };
  const stop = every300(run);
  window.addEventListener("load", run);
  window.addEventListener("resize", run);
  run();
  return () => {
    stop();
    window.removeEventListener("load", run);
    window.removeEventListener("resize", run);
    ros.forEach((r) => r.disconnect());
  };
}

/** Blog pages' component logic: highlight the table-of-contents entry for the section in view. */
function toc(): Cleanup {
  let cleanupScroll: (() => void) | undefined;

  const timer = setTimeout(() => {
    const links = [...document.querySelectorAll<HTMLElement>("[data-toc]")];
    if (!links.length) return;

    const targets: { id: string; el: HTMLElement; link: HTMLElement }[] = [];
    for (const a of links) {
      const id = a.getAttribute("data-toc");
      if (!id) continue;
      const el = document.getElementById(id);
      if (el) targets.push({ id, el, link: a });
    }

    if (!targets.length) return;

    let activeId = targets[0].id;

    const update = () => {
      // Find the last heading that has scrolled past the header offset (~160px from top of viewport)
      const offset = 160;
      let currentId = targets[0].id;
      for (const t of targets) {
        const rect = t.el.getBoundingClientRect();
        if (rect.top <= offset) {
          currentId = t.id;
        } else {
          break;
        }
      }

      if (currentId !== activeId) {
        activeId = currentId;
      }

      for (const t of targets) {
        const on = t.id === activeId;
        t.link.style.color = on ? "#0C4B3B" : "#5C6762";
        t.link.style.borderLeftColor = on ? "#FF6347" : "rgba(12,75,59,.12)";
        t.link.style.borderLeftWidth = "2px";
        t.link.style.borderLeftStyle = "solid";
        t.link.style.fontWeight = on ? "700" : "500";
      }
    };

    update();

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    cleanupScroll = () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, 250);

  return () => {
    clearTimeout(timer);
    cleanupScroll?.();
  };
}

/**
 * Imported pages' scroll motion (`window.__nxMotion` script): [data-reveal] blocks fade in, with
 * [data-count] count-ups, [data-draw-path] line draws and [data-grow] bars inside them.
 */
function motion(): Cleanup {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = new WeakSet<Element>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  function count(el: Element) {
    const end = parseFloat(el.getAttribute("data-count") || "") || 0,
      dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    const pre = el.getAttribute("data-pre") || "",
      suf = el.getAttribute("data-suf") || "",
      dur = 1200,
      t0 = performance.now();
    function step(now: number) {
      const p = Math.min(1, (now - t0) / dur),
        v = end * ease(p);
      el.textContent = pre + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function draw(el: Element) {
    const nodes = el.querySelectorAll<SVGPathElement>("[data-draw-path]");
    nodes.forEach((p, i) => {
      let len = 0;
      try {
        len = p.getTotalLength();
      } catch {
        len = 600;
      }
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.style.transition = "stroke-dashoffset 1.5s cubic-bezier(.22,.7,.2,1) " + i * 110 + "ms";
      void p.getBoundingClientRect();
      p.style.strokeDashoffset = "0";
    });
    el.querySelectorAll<HTMLElement>("[data-grow]").forEach((b, j) => {
      const to = b.getAttribute("data-grow") || "";
      b.style.transition = "height .9s cubic-bezier(.22,.9,.2,1) " + j * 55 + "ms, width .9s cubic-bezier(.22,.9,.2,1) " + j * 55 + "ms";
      if (b.getAttribute("data-grow-axis") === "x") b.style.width = to;
      else b.style.height = to;
    });
  }
  function settle(el: HTMLElement) {
    if (getComputedStyle(el).opacity === "0") {
      el.style.transition = "none";
      el.style.opacity = "1";
      el.style.transform = "none";
    }
  }
  function show(el: HTMLElement) {
    const d = reduce ? 0 : parseInt(el.getAttribute("data-delay") || "0", 10);
    timers.push(
      setTimeout(() => {
        el.style.opacity = "1";
        el.style.transform = "none";
        timers.push(setTimeout(() => settle(el), 120));
        el.querySelectorAll("[data-count]").forEach((c) => {
          if (!reduce) count(c);
        });
        if (el.hasAttribute("data-count") && !reduce) count(el);
        draw(el);
      }, d),
    );
  }
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              if (e.isIntersecting) {
                show(e.target as HTMLElement);
                io!.unobserve(e.target);
              }
            }),
          { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
        )
      : null;
  function scan() {
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (reduce || !io) {
        el.style.opacity = "1";
        el.style.transform = "none";
        draw(el);
        return;
      }
      io.observe(el);
    });
  }
  function rescue() {
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      if (getComputedStyle(el).opacity !== "0") return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 200 && r.bottom > -200) show(el);
    });
  }
  const mo = window.MutationObserver ? new MutationObserver(scan) : null;
  mo?.observe(document.documentElement, { childList: true, subtree: true });
  scan();
  rescue();
  const iv = setInterval(() => {
    scan();
    rescue();
  }, 500);
  window.addEventListener("scroll", rescue, { passive: true });
  return () => {
    clearInterval(iv);
    timers.forEach(clearTimeout);
    mo?.disconnect();
    io?.disconnect();
    window.removeEventListener("scroll", rescue);
  };
}

function fit1040(cap = 1.85): Cleanup {
  // Most designs are drawn at 1024px (scaled from 1040), but some are 1222-1240px wide; scaling those by
  // clientWidth/1040 pushes their pixel-placed content past the viewport edge and cuts it off.
  function designWidth(dcx: HTMLElement) {
    let max = 0;
    dcx.querySelectorAll<HTMLElement>("[data-z]").forEach((el) => {
      const m = parseInt(el.style.maxWidth || "", 10);
      if (m > max) max = m;
    });
    return max > 1100 ? max : 1040;
  }
  function apply() {
    const dcx = document.querySelector<HTMLElement>(".dcx");
    if (!dcx) return;
    dcx.classList.add("dcx-fit1040");
    const w = document.documentElement.clientWidth || window.innerWidth;
    const base = designWidth(dcx);
    if (w > base) {
      const z = Math.min(w / base, cap);
      dcx.style.zoom = z.toFixed(3);
    } else {
      dcx.style.zoom = "";
    }
  }
  apply();
  window.addEventListener("resize", apply);
  return () => {
    window.removeEventListener("resize", apply);
    const dcx = document.querySelector<HTMLElement>(".dcx");
    if (dcx) {
      dcx.style.zoom = "";
      dcx.classList.remove("dcx-fit1040");
    }
  };
}

/**
 * Fixed-size design mockups ([data-mock], absolutely positioned inside) that are wider than their
 * column are scaled down to fit instead of scrolling sideways or overlapping neighbouring content.
 */
function fitMocks(): Cleanup {
  function apply() {
    document.querySelectorAll<HTMLElement>(".dcx [data-mock]").forEach((el) => {
      if (/hero$/.test(el.dataset.mock || "")) return;
      const par = el.parentElement;
      if (!par) return;
      el.style.zoom = "";
      const natural = el.offsetWidth;
      const avail = par.clientWidth;
      if (natural > 0 && avail > 0 && natural > avail + 1) {
        el.style.zoom = (avail / natural).toFixed(4);
        par.style.overflowX = "hidden";
      }
    });
  }
  const timers = [0, 300, 1200].map((ms) => window.setTimeout(apply, ms));
  window.addEventListener("resize", apply);
  return () => {
    timers.forEach(clearTimeout);
    window.removeEventListener("resize", apply);
  };
}

const EFFECTS: Record<string, () => Cleanup> = { robots, scale, fit, fitScaleBlog, toc, motion, fit1040, fitMocks, fit1040Md: () => fit1040(1.5) };

export function DcEffects({ effects }: { effects: string[] }) {
  const key = effects.join(",");
  useEffect(() => {
    if (typeof document !== "undefined" && document.documentElement.style.zoom) {
      document.documentElement.style.zoom = "";
    }
    const cleanups = key
      .split(",")
      .filter(Boolean)
      .map((name) => EFFECTS[name]?.());
    return () => cleanups.forEach((c) => c?.());
  }, [key]);
  return null;
}
