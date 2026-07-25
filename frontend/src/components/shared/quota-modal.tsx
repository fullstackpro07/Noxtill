import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export interface QuotaModalProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  used: number;
  quota: number;
  resource?: string;
}

/** Blocks a send/action that would exceed plan quota — mirrors the backend's "block before sending anything" rule. */
export function QuotaModal({ open, onClose, onUpgrade, used, quota, resource = "messages" }: QuotaModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="You've hit your monthly limit"
      description={`You've used ${used.toLocaleString()} of ${quota.toLocaleString()} ${resource} this month. Upgrade your plan to keep sending — nothing will send until then.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button variant="accent" onClick={onUpgrade}>
            <Zap className="h-4 w-4" aria-hidden />
            Upgrade plan
          </Button>
        </>
      }
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-destructive"
          style={{ width: `${Math.min(100, (used / quota) * 100)}%` }}
        />
      </div>
    </Dialog>
  );
}
