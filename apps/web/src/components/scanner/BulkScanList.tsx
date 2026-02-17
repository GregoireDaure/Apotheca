import {
  useBulkScanStore,
  type BulkScanItem,
} from "@/stores/bulk-scan.store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CircleCheck,
  AlertTriangle,
  X,
  Loader2,
  Package,
  ArrowUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

function StatusIcon({ item }: Readonly<{ item: BulkScanItem }>) {
  switch (item.status) {
    case "confirmed":
      return <CircleCheck className="h-5 w-5 text-status-clear" />;
    case "error":
      return <AlertTriangle className="h-5 w-5 text-status-danger" />;
    default:
      return item.alreadyInInventory ? (
        <ArrowUp className="h-5 w-5 text-status-info" />
      ) : (
        <Package className="h-5 w-5 text-muted-foreground" />
      );
  }
}

function BulkScanItemRow({ item }: Readonly<{ item: BulkScanItem }>) {
  const removeItem = useBulkScanStore((s) => s.removeItem);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-all animate-slide-up",
        item.status === "confirmed" && "bg-status-clear-bg border-status-clear/20",
        item.status === "error" && "bg-status-danger-bg border-status-danger/20",
        item.status === "pending" && "bg-card"
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
        <StatusIcon item={item} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-foreground">
          {item.denomination}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-body-small text-muted-foreground">
            {item.pharmaceuticalForm}
          </span>
          {item.alreadyInInventory && item.status === "pending" && (
            <Badge variant="info" className="text-[10px] px-1.5 py-0">
              qty +1
            </Badge>
          )}
        </div>
        {item.status === "error" && item.errorMessage && (
          <p className="mt-0.5 text-body-small text-status-danger">
            {item.errorMessage}
          </p>
        )}
      </div>

      {item.status === "pending" && (
        <button
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          onClick={() => removeItem(item.id)}
          aria-label="Remove item"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface BulkScanListProps {
  onConfirmAll: () => void;
  isConfirming: boolean;
}

export function BulkScanList({
  onConfirmAll,
  isConfirming,
}: Readonly<BulkScanListProps>) {
  const items = useBulkScanStore((s) => s.items);
  const direction = useBulkScanStore((s) => s.direction);
  const endSession = useBulkScanStore((s) => s.endSession);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const confirmedCount = items.filter((i) => i.status === "confirmed").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-body text-muted-foreground">
          Start scanning to build your list
        </p>
        <p className="mt-1 text-body-small text-muted-foreground/70">
          Each scan adds to the staging list below
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-2">
        <div className="flex items-center gap-3 text-body-small">
          {pendingCount > 0 && (
            <span className="text-foreground font-medium">
              {pendingCount} pending
            </span>
          )}
          {confirmedCount > 0 && (
            <span className="text-status-clear">
              {confirmedCount} done
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-status-danger">
              {errorCount} failed
            </span>
          )}
        </div>
        <span className="text-body-small text-muted-foreground">
          {items.length} scanned
        </span>
      </div>

      {/* Items list */}
      <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <BulkScanItemRow key={item.id} item={item} />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <Button
          variant="outline"
          className="flex-1"
          onClick={endSession}
          disabled={isConfirming}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 h-12"
          onClick={onConfirmAll}
          disabled={pendingCount === 0 || isConfirming}
        >
          {isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {direction === "add" ? "Adding..." : "Removing..."}
            </>
          ) : (
            <>
              {direction === "add" ? "Confirm All" : "Remove All"} ({pendingCount})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
