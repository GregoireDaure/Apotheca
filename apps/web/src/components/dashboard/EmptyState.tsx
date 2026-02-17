import { Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Pill className="h-16 w-16 text-muted-foreground/40" />
      <h2 className="mt-4 text-heading-2 text-foreground">
        Your cabinet is empty
      </h2>
      <p className="mt-2 max-w-sm text-body text-muted-foreground">
        Scan your first medicine to start building your digital inventory.
      </p>

      <Button
        size="lg"
        className="mt-8 h-12 px-8 text-body text-white font-semibold"
        onClick={() => navigate("/scan")}
        autoFocus
      >
        Scan Your First Medicine
      </Button>

      {/* How it works */}
      <div className="mt-10 w-full max-w-sm rounded-lg border bg-card p-5 shadow-card">
        <h3 className="text-body-small font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </h3>
        <ol className="mt-3 space-y-3 text-left">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              1
            </span>
            <span className="text-body text-foreground">
              Scan the barcode or DataMatrix on your medicine box
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              2
            </span>
            <span className="text-body text-foreground">
              The app finds the medicine info automatically
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              3
            </span>
            <span className="text-body text-foreground">
              Your digital cabinet is always up to date
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
