import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { CircleCheck, AlertTriangle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActionItem } from "@/components/dashboard/ActionItem";
import { MedicineRow } from "@/components/dashboard/MedicineRow";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useState, useMemo } from "react";
import { differenceInDays } from "date-fns";

function getExpiryStatus(stats: DashboardStats): "danger" | "warning" | "default" {
  if (stats.expired > 0) return "danger";
  if (stats.expiringSoon > 0) return "warning";
  return "default";
}

interface DashboardStats {
  total: number;
  expiringSoon: number;
  expired: number;
  restockNeeded: number;
}

interface ActionItems {
  expiring: InventoryItem[];
  expired: InventoryItem[];
  restock: InventoryItem[];
}

interface InventoryItem {
  id: string;
  cis: string;
  quantity: number;
  batchNumber: string | null;
  expiryDate: string | null;
  restockAlert: boolean;
  medicine: {
    cis: string;
    denomination: string;
    pharmaceuticalForm: string;
    composition?: { substance: string; dosage: string }[];
    bdpmUrl?: string;
  };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards skeleton */}
      <div className="flex gap-3">
        <Skeleton className="h-[72px] flex-1 rounded-lg" />
        <Skeleton className="h-[72px] flex-1 rounded-lg" />
        <Skeleton className="h-[72px] flex-1 rounded-lg" />
      </div>
      {/* Medicine rows skeleton */}
      <div className="space-y-0 rounded-lg border">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[60px] w-full" />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await api.get("/inventory/dashboard");
      return res.data;
    },
  });

  const actionsQuery = useQuery<ActionItems>({
    queryKey: ["dashboard", "actions"],
    queryFn: async () => {
      const res = await api.get("/inventory/actions");
      return res.data;
    },
  });

  const inventoryQuery = useQuery<InventoryItem[]>({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await api.get("/inventory");
      return res.data;
    },
  });

  const isLoading =
    statsQuery.isLoading || actionsQuery.isLoading || inventoryQuery.isLoading;

  // Filter inventory by search
  const filteredInventory = useMemo(() => {
    if (!inventoryQuery.data) return [];
    if (!searchQuery.trim()) return inventoryQuery.data;
    const q = searchQuery.toLowerCase();
    return inventoryQuery.data.filter((item) =>
      item.medicine.denomination.toLowerCase().includes(q)
    );
  }, [inventoryQuery.data, searchQuery]);

  // Empty state check
  if (!isLoading && (!inventoryQuery.data || inventoryQuery.data.length === 0)) {
    return <EmptyState />;
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const stats = statsQuery.data;
  const actions = actionsQuery.data;
  const hasActions =
    actions &&
    (actions.expiring.length > 0 ||
      actions.expired.length > 0 ||
      actions.restock.length > 0);
  const allClear = stats?.expiringSoon === 0 && stats?.expired === 0 && stats?.restockNeeded === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <h1 className="text-heading-1 text-foreground">Your Cabinet</h1>

      {/* Stat Cards Row */}
      {stats && (
        <div className="flex gap-3">
          <StatCard
            value={stats.total}
            label="Medicines"
            status={stats.total > 0 ? "clear" : "default"}
          />
          <StatCard
            value={stats.expiringSoon + stats.expired}
            label="Expiring"
            status={getExpiryStatus(stats)}
          />
          <StatCard
            value={stats.restockNeeded}
            label="Restock"
            status={stats.restockNeeded > 0 ? "danger" : "default"}
          />
        </div>
      )}

      {/* All Clear banner */}
      {allClear && (
        <div className="flex items-center gap-2 rounded-lg bg-status-clear-bg px-4 py-3">
          <CircleCheck className="h-5 w-5 text-status-clear" />
          <span className="text-body font-medium text-status-clear">
            All clear — nothing needs attention
          </span>
        </div>
      )}

      {/* Action Needed section */}
      {hasActions && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-status-warning" />
            <h2 className="text-heading-3 text-foreground">Action Needed</h2>
          </div>
          <ul
            className="rounded-lg bg-status-warning-bg/50 border border-status-warning/20"
          >
            {actions.expired.map((item) => (
              <ActionItem
                key={`expired-${item.id}`}
                id={item.id}
                name={item.medicine.denomination}
                detail="Expired"
                type="expired"
              />
            ))}
            {actions.expiring.map((item) => {
              const days = item.expiryDate
                ? differenceInDays(new Date(item.expiryDate), new Date())
                : 0;
              return (
                <ActionItem
                  key={`expiring-${item.id}`}
                  id={item.id}
                  name={item.medicine.denomination}
                  detail={`Expires in ${days} day${days === 1 ? "" : "s"}`}
                  type="expiring"
                />
              );
            })}
            {actions.restock.map((item) => (
              <ActionItem
                key={`restock-${item.id}`}
                id={item.id}
                name={item.medicine.denomination}
                detail="Last box — consider restocking"
                type="restock"
              />
            ))}
          </ul>
        </section>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search medicines..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* All Medicines list */}
      <section>
        <h2 className="mb-2 text-heading-3 text-foreground">
          All Medicines
          {searchQuery && (
            <span className="ml-2 text-body text-muted-foreground">
              ({filteredInventory.length} result
              {filteredInventory.length === 1 ? "" : "s"})
            </span>
          )}
        </h2>
        {filteredInventory.length === 0 ? (
          <p className="py-8 text-center text-body text-muted-foreground">
            No medicines match &ldquo;{searchQuery}&rdquo;
          </p>
        ) : (
          <ul className="rounded-lg border shadow-card list-none">
            {filteredInventory.map((item, index) => (
              <MedicineRow
                key={item.id}
                id={item.id}
                name={item.medicine.denomination}
                form={item.medicine.pharmaceuticalForm}
                quantity={item.quantity}
                isFirst={index === 0}
                isLast={index === filteredInventory.length - 1}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
