import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  Minus,
  Plus,
  CircleCheck,
  AlertTriangle,
  CircleX,
  ExternalLink,
  Bell,
  BellOff,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { differenceInDays, format } from "date-fns";
import { useState } from "react";

interface MedicineDetailData {
  id: string;
  cis: string;
  quantity: number;
  batchNumber: string | null;
  expiryDate: string | null;
  restockAlert: boolean;
  medicine: {
    cis: string;
    cip13?: string;
    denomination: string;
    pharmaceuticalForm: string;
    administrationRoutes?: string[];
    composition?: { substance: string; dosage: string }[];
    bdpmUrl?: string;
    status?: string;
  };
}

function ExpiryStatus({ expiryDate }: Readonly<{ expiryDate: string | null }>) {
  if (!expiryDate) {
    return (
      <span className="text-body-small text-muted-foreground">
        No expiry date
      </span>
    );
  }

  const days = differenceInDays(new Date(expiryDate), new Date());

  if (days < 0) {
    return (
      <div className="flex items-center gap-1.5">
        <CircleX className="h-4 w-4 text-status-danger" />
        <span className="text-body font-medium text-status-danger">
          Expired
        </span>
      </div>
    );
  }

  if (days <= 30) {
    return (
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-status-warning" />
        <span className="text-body font-medium text-status-warning">
          Expires in {days} day{days === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <CircleCheck className="h-4 w-4 text-status-clear" />
      <span className="text-body font-medium text-status-clear">
        Valid — {format(new Date(expiryDate), "MMM yyyy")}
      </span>
    </div>
  );
}

export default function MedicineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const { data, isLoading, error } = useQuery<MedicineDetailData>({
    queryKey: ["inventory", id],
    queryFn: async () => {
      const res = await api.get(`/inventory/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (update: Record<string, unknown>) => {
      return api.patch(`/inventory/${id}`, update);
    },
    // Optimistic UI: update immediately, rollback on error
    onMutate: async (update) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["inventory", id] });

      // Snapshot current data
      const previous = queryClient.getQueryData<MedicineDetailData>(["inventory", id]);

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<MedicineDetailData>(["inventory", id], {
          ...previous,
          ...update,
          quantity: (update.quantity as number) ?? previous.quantity,
          restockAlert: (update.restockAlert as boolean) ?? previous.restockAlert,
        });
      }

      return { previous };
    },
    onError: (_err, _update, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(["inventory", id], context.previous);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["inventory", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/inventory/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/");
    },
  });

  const handleIncrement = () => {
    if (!data) return;
    updateMutation.mutate({ quantity: data.quantity + 1 });
  };

  const handleDecrement = () => {
    if (!data) return;
    if (data.quantity <= 1) {
      setShowRemoveDialog(true);
      return;
    }
    updateMutation.mutate({ quantity: data.quantity - 1 });
  };

  const handleToggleRestock = () => {
    if (!data) return;
    updateMutation.mutate({ restockAlert: !data.restockAlert });
  };

  const handleRemove = () => {
    removeMutation.mutate();
    setShowRemoveDialog(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-body text-muted-foreground">
          Medicine not found.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
          Back to Cabinet
        </Button>
      </div>
    );
  }

  const med = data.medicine;

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1 text-body text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
        Back
      </button>

      {/* Medicine Card (Apple Wallet-style) */}
      <article className="rounded-xl border bg-card p-5 shadow-card">
        {/* Header */}
        <h1 className="text-heading-2 text-foreground">{med.denomination}</h1>
        {med.pharmaceuticalForm && (
          <p className="mt-1 text-body text-muted-foreground">
            {med.pharmaceuticalForm}
          </p>
        )}

        <Separator className="my-4" />

        {/* Stat blocks: Expiry + Quantity */}
        <div className="flex gap-6">
          <div>
            <p className="text-caption uppercase tracking-wide text-muted-foreground">
              Expiry
            </p>
            <div className="mt-1">
              <ExpiryStatus expiryDate={data.expiryDate} />
            </div>
          </div>
          <div>
            <p className="text-caption uppercase tracking-wide text-muted-foreground">
              In Stock
            </p>
            <p className="mt-1 text-heading-2 font-bold text-foreground">
              {data.quantity}
              <span className="ml-1 text-body font-normal text-muted-foreground">
                box{data.quantity === 1 ? "" : "es"}
              </span>
            </p>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Quantity stepper */}
        <div className="flex items-center justify-between">
          <span className="text-body font-medium text-foreground">Quantity</span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={handleDecrement}
              disabled={updateMutation.isPending}
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span
              className="min-w-[40px] text-center text-2xl font-bold text-foreground"
              aria-live="polite"
            >
              {data.quantity}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={handleIncrement}
              disabled={updateMutation.isPending}
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Restock toggle */}
        <button
          onClick={handleToggleRestock}
          className="flex w-full items-center justify-between py-2"
          aria-pressed={data.restockAlert}
        >
          <div className="flex items-center gap-2">
            {data.restockAlert ? (
              <Bell className="h-4 w-4 text-status-warning" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-body text-foreground">
              Alert on last box
            </span>
          </div>
          <Badge variant={data.restockAlert ? "warning" : "secondary"}>
            {data.restockAlert ? "On" : "Off"}
          </Badge>
        </button>
      </article>

      {/* Composition Section */}
      {med.composition && med.composition.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-heading-3 text-foreground">Composition</h2>
          <div className="mt-3 space-y-2">
            {med.composition.map((comp) => (
              <div key={comp.substance} className="flex items-baseline justify-between">
                <span className="text-body text-foreground">
                  {comp.substance}
                </span>
                <span className="text-body-small text-muted-foreground">
                  {comp.dosage}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* BDPM Link */}
      {med.bdpmUrl && (
        <a
          href={med.bdpmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border bg-status-info-bg p-4 shadow-card transition-colors hover:bg-status-info-bg/80"
        >
          <div>
            <p className="text-body font-medium text-foreground">
              View Full Notice
            </p>
            <p className="text-body-small text-muted-foreground">
              Official BDPM page
            </p>
          </div>
          <ExternalLink className="h-5 w-5 text-status-info" />
        </a>
      )}

      {/* Remove button */}
      <Button
        variant="outline"
        className="w-full text-destructive hover:text-destructive hover:bg-status-danger-bg"
        onClick={() => setShowRemoveDialog(true)}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Remove from inventory
      </Button>

      {/* Remove confirmation dialog */}
      <Dialog
        open={showRemoveDialog}
        onOpenChange={setShowRemoveDialog}
      >
        <div className={showRemoveDialog ? "fixed inset-0 z-50 flex items-center justify-center bg-black/50" : "hidden"}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-card p-6 shadow-lg">
            <DialogHeader>
              <DialogTitle>Remove from inventory?</DialogTitle>
              <DialogDescription>
                {med.denomination} will be removed from your cabinet. This
                action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowRemoveDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleRemove}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Remove
              </Button>
            </DialogFooter>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
