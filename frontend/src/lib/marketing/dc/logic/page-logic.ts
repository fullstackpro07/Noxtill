/* eslint-disable @typescript-eslint/no-explicit-any */
import type { KeyboardEvent } from "react";
import { DcLogic } from "@/components/site/dc/dc-host";

/** `Finance - Accounting.dc.html`: four tabs with arrow-key navigation (ported verbatim). */
export class FinanceLogic extends DcLogic<Record<string, never>, { t: number }> {
  state = { t: 0 };
  renderVals() {
    const t = this.state.t,
      n = 4,
      o: Record<string, any> = {};
    for (let i = 0; i < n; i++) {
      const on = i === t;
      o["s" + i] = on ? "true" : "false";
      o["ti" + i] = on ? 0 : -1;
      o["d" + i] = on ? "grid" : "none";
      o["bd" + i] = on ? "#07784C" : "transparent";
      o["fg" + i] = on ? "#07784C" : "#3D4F4A";
      o["go" + i] = () => this.setState({ t: i });
    }
    o.tabKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const k = (t + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
      this.setState({ t: k });
      const b = document.getElementById("fa-tab-" + k);
      b?.focus();
    };
    return o;
  }
}

/**
 * `Documents - eSign.dc.html`: the hero mock overlaps the next section on wide screens. Initial width
 * is the design's default (1280) on server and client alike; the real width is read on mount.
 */
export class DocumentsLogic extends DcLogic<Record<string, never>, { w: number }> {
  state = { w: 1280 };
  r = () => this.setState({ w: window.innerWidth });
  componentDidMount() {
    window.addEventListener("resize", this.r);
    this.r();
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.r);
  }
  renderVals() {
    return { ovl: this.state.w >= 900 ? "-120px" : "0px" };
  }
}
