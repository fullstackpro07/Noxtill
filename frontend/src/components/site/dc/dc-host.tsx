"use client";

import { Component, type ReactNode } from "react";
import { renderDc, type DcContext, type DcNode, type DcVals } from "./dc-render";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Base class for the design files' component logic (`class Component extends DCLogic` in each
 * .dc.html). Same contract as the design runtime: `state`, `setState`, lifecycle hooks and
 * `renderVals()`, which returns the values the template binds to.
 */
export class DcLogic<P = any, S extends Record<string, any> = any> {
  props: P;
  state = {} as S;
  __host?: DcHost;
  constructor(props: P) {
    this.props = props;
  }
  setState(update: Partial<S> | ((s: S, p: P) => Partial<S> | null), cb?: () => void) {
    const next = typeof update === "function" ? update(this.state, this.props) : update;
    if (next) this.state = { ...this.state, ...next };
    this.__host?.bump(cb);
  }
  forceUpdate() {
    this.__host?.bump();
  }
  componentDidMount() {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  componentDidUpdate(prev: P) {}
  componentWillUnmount() {}
  renderVals(): DcVals {
    return {};
  }
}

type HostProps = {
  tree: DcNode[];
  logic: new (props: any) => DcLogic;
  props?: Record<string, unknown>;
  ctx?: DcContext;
};

export class DcHost extends Component<HostProps, { v: number }> {
  logic: DcLogic;
  mounted = false;
  state = { v: 0 };
  constructor(p: HostProps) {
    super(p);
    this.logic = new p.logic(p.props ?? {});
    this.logic.__host = this;
  }
  bump(cb?: () => void) {
    if (!this.mounted) {
      cb?.();
      return;
    }
    this.setState((s) => ({ v: s.v + 1 }), cb);
  }
  componentDidMount() {
    this.mounted = true;
    this.logic.componentDidMount();
  }
  componentDidUpdate(prev: HostProps) {
    if (prev.props !== this.props.props) {
      const old = this.logic.props;
      this.logic.props = this.props.props ?? {};
      this.logic.componentDidUpdate(old);
    } else {
      this.logic.componentDidUpdate(this.logic.props);
    }
  }
  componentWillUnmount() {
    this.mounted = false;
    this.logic.componentWillUnmount();
  }
  render(): ReactNode {
    const vals = { ...(this.props.props ?? {}), ...this.logic.renderVals() };
    return renderDc(this.props.tree, vals, this.props.ctx);
  }
}
