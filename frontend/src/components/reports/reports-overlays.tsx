"use client";

import { useReports } from "./reports-context";
import { ReportDrawer } from "./report-drawer";
import { ReportViewer } from "./report-viewer";
import { PanelHost } from "./reports-panels";
import { ConfirmModal, ToastView } from "./reports-chrome";

/** Everything that layers over the Reports screens: drawer, document viewer, side panel, confirm, toast. */
export function ReportsOverlays() {
  const { panel, drawer, viewerRunId, confirm } = useReports();
  return (
    <>
      {viewerRunId ? <ReportViewer /> : null}
      {drawer ? <ReportDrawer /> : null}
      {panel ? <PanelHost panel={panel} /> : null}
      {confirm ? <ConfirmModal /> : null}
      <ToastView />
    </>
  );
}
