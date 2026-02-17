import { AlertTriangle, CircleX, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface ActionItemProps {
  id: string;
  name: string;
  detail: string;
  type: "expiring" | "expired" | "restock";
}

export function ActionItem({ id, name, detail, type }: Readonly<ActionItemProps>) {

  const config = {
    expiring: {
      icon: AlertTriangle,
      badgeVariant: "warning" as const,
      badgeText: "Expiring",
    },
    expired: {
      icon: CircleX,
      badgeVariant: "destructive" as const,
      badgeText: "Expired",
    },
    restock: {
      icon: Package,
      badgeVariant: "destructive" as const,
      badgeText: "Restock",
    },
  }[type];

  const Icon = config.icon;

  return (
    <li>
      <Link
        to={`/medicine/${id}`}
        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/50 active:bg-accent"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-5 w-5 shrink-0 text-status-warning" />
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-foreground">{name}</p>
            <p className="text-body-small text-muted-foreground">{detail}</p>
          </div>
        </div>
        <Badge variant={config.badgeVariant} aria-label={config.badgeText}>
          {config.badgeText}
        </Badge>
      </Link>
    </li>
  );
}
