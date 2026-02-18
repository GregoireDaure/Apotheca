import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { CircleCheck, Clock, Package, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActionItem } from "@/components/dashboard/ActionItem";
import { MedicineRow } from "@/components/dashboard/MedicineRow";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

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

/** Create a stable key from a medicine's composition (active substances + dosages) */
function compositionKey(item: InventoryItem): string {
  const comp = item.medicine.composition;
  if (!comp || comp.length === 0) return `_solo_${item.id}`;
  return comp
    .map((c) => `${c.substance.trim().toUpperCase()}|${c.dosage.trim().toUpperCase()}`)
    .sort()
    .join("+");
}

/** A user-friendly label for a composition group */
function compositionLabel(comp: { substance: string; dosage: string }[]): string {
  return comp
    .map((c) => `${c.substance}${c.dosage ? ` ${c.dosage}` : ""}`)
    .join(" + ");
}

interface MedicineGroup {
  key: string;
  label: string;
  form: string;
  items: InventoryItem[];
  totalQuantity: number;
}

/** Group inventory items by composition */
function groupByComposition(items: InventoryItem[]): MedicineGroup[] {
  const map = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = compositionKey(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  const groups: MedicineGroup[] = [];
  for (const [key, groupItems] of map) {
    const first = groupItems[0];
    const comp = first.medicine.composition;
    groups.push({
      key,
      label:
        comp && comp.length > 0
          ? compositionLabel(comp)
          : first.medicine.denomination,
      form: first.medicine.pharmaceuticalForm ?? "",
      items: groupItems,
      totalQuantity: groupItems.reduce((sum, i) => sum + i.quantity, 0),
    });
  }

  return groups;
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

const SCROLL_KEY = "dashboard-scroll";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expiryExpanded, setExpiryExpanded] = useState(false);
  const [restockExpanded, setRestockExpanded] = useState(false);

  // Save scroll position continuously so it's captured before navigation
  useEffect(() => {
    const onScroll = () => {
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  // Restore scroll position once data is loaded and the real content renders
  const restoredRef = useRef(false);
  useLayoutEffect(() => {
    if (isLoading || restoredRef.current) return;
    restoredRef.current = true;

    // Disable browser's native scroll restoration
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (!saved) return;
    const y = parseInt(saved, 10);
    if (y <= 0) return;

    // Immediate attempt (works when DOM is ready synchronously)
    window.scrollTo(0, y);

    // Fallback for mobile Safari where layout may not be committed yet
    const timer = setTimeout(() => window.scrollTo(0, y), 50);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Filter inventory by search and sort alphabetically
  const filteredInventory = useMemo(() => {
    if (!inventoryQuery.data) return [];
    const sorted = [...inventoryQuery.data].sort((a, b) =>
      a.medicine.denomination.localeCompare(b.medicine.denomination),
    );
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((item) =>
      item.medicine.denomination.toLowerCase().includes(q)
    );
  }, [inventoryQuery.data, searchQuery]);

  // Group filtered items by composition
  const groups = useMemo(
    () => groupByComposition(filteredInventory),
    [filteredInventory],
  );

  // Empty state check
  if (!isLoading && (!inventoryQuery.data || inventoryQuery.data.length === 0)) {
    return <EmptyState />;
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const stats = statsQuery.data;
  const actions = actionsQuery.data;
  const hasExpiry =
    actions && (actions.expiring.length > 0 || actions.expired.length > 0);
  const hasRestock = actions && actions.restock.length > 0;
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

      {/* Expiring / Expired section — collapsible, collapsed by default */}
      {hasExpiry && actions && (
        <section>
          <button
            type="button"
            onClick={() => setExpiryExpanded((v) => !v)}
            className="flex w-full items-center gap-2 mb-2 text-left"
          >
            {expiryExpanded ? (
              <ChevronDown className="h-4 w-4 text-status-warning" />
            ) : (
              <ChevronRight className="h-4 w-4 text-status-warning" />
            )}
            <Clock className="h-4 w-4 text-status-warning" />
            <h2 className="text-heading-3 text-foreground">Expiring</h2>
            <span className="ml-auto text-body-small text-muted-foreground">
              {actions.expired.length + actions.expiring.length} item{(actions.expired.length + actions.expiring.length) === 1 ? "" : "s"}
            </span>
          </button>
          {expiryExpanded && (
            <ul className="rounded-lg bg-status-warning-bg/50 border border-status-warning/20">
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
            </ul>
          )}
        </section>
      )}

      {/* Restock section — collapsible, collapsed by default */}
      {hasRestock && actions && (
        <section>
          <button
            type="button"
            onClick={() => setRestockExpanded((v) => !v)}
            className="flex w-full items-center gap-2 mb-2 text-left"
          >
            {restockExpanded ? (
              <ChevronDown className="h-4 w-4 text-primary" />
            ) : (
              <ChevronRight className="h-4 w-4 text-primary" />
            )}
            <Package className="h-4 w-4 text-primary" />
            <h2 className="text-heading-3 text-foreground">Restock</h2>
            <span className="ml-auto text-body-small text-muted-foreground">
              {actions.restock.length} item{actions.restock.length === 1 ? "" : "s"}
            </span>
          </button>
          {restockExpanded && (
            <ul className="rounded-lg bg-primary/5 border border-primary/20">
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
          )}
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
            {groups.map((group, gi) => {
              const isFirstGroup = gi === 0;
              const isLastGroup = gi === groups.length - 1;

              // Single-item group — render flat row
              if (group.items.length === 1) {
                const item = group.items[0];
                return (
                  <MedicineRow
                    key={item.id}
                    id={item.id}
                    name={item.medicine.denomination}
                    form={item.medicine.pharmaceuticalForm}
                    quantity={item.quantity}
                    isFirst={isFirstGroup}
                    isLast={isLastGroup}
                  />
                );
              }

              // Multi-item group — collapsible
              const expanded = expandedGroups.has(group.key);
              return (
                <li
                  key={group.key}
                  className={cn(
                    !isLastGroup && "border-b border-border",
                    isFirstGroup && "rounded-t-lg",
                    isLastGroup && "rounded-b-lg",
                  )}
                >
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className={cn(
                      "flex w-full items-center justify-between bg-card px-4 py-3 text-left transition-colors hover:bg-accent/30 active:bg-accent/50",
                      isFirstGroup && "rounded-t-lg",
                      isLastGroup && !expanded && "rounded-b-lg",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-foreground">
                          {group.label}
                        </p>
                        <p className="truncate text-body-small text-muted-foreground">
                          {group.form} · {group.items.length} brands
                        </p>
                      </div>
                    </div>
                    <span
                      className="ml-3 inline-flex min-w-[32px] items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-body font-bold text-primary"
                      aria-label={`${group.totalQuantity} boxes total`}
                    >
                      {group.totalQuantity}
                    </span>
                  </button>

                  {/* Expanded items */}
                  {expanded && (
                    <ul className="list-none border-t border-border">
                      {group.items.map((item, ii) => (
                        <MedicineRow
                          key={item.id}
                          id={item.id}
                          name={item.medicine.denomination}
                          form={item.medicine.pharmaceuticalForm}
                          quantity={item.quantity}
                          isFirst={false}
                          isLast={isLastGroup && ii === group.items.length - 1}
                          indented
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
