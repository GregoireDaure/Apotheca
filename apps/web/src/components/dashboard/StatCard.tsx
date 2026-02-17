import { cn } from "@/lib/utils";

interface StatCardProps {
  value: number;
  label: string;
  status?: "clear" | "warning" | "danger" | "default";
}

export function StatCard({ value, label, status = "default" }: Readonly<StatCardProps>) {
  const borderColor = {
    clear: "border-l-status-clear",
    warning: "border-l-status-warning",
    danger: "border-l-status-danger",
    default: "border-l-border",
  }[status];

  const valueColor = {
    clear: "text-status-clear",
    warning: "text-status-warning",
    danger: "text-status-danger",
    default: "text-foreground",
  }[status];

  return (
    <output
      aria-label={`${value} ${label}`}
      className={cn(
        "flex flex-1 flex-col rounded-lg border-l-[3px] bg-card px-3 py-3 shadow-card",
        borderColor
      )}
    >
      <span className={cn("text-2xl font-bold leading-none", valueColor)}>
        {value}
      </span>
      <span className="mt-1 text-caption text-muted-foreground">{label}</span>
    </output>
  );
}
