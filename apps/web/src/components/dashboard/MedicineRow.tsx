import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MedicineRowProps {
  id: string;
  name: string;
  form?: string;
  quantity: number;
  isFirst?: boolean;
  isLast?: boolean;
  indented?: boolean;
}

export function MedicineRow({
  id,
  name,
  form,
  quantity,
  isFirst = false,
  isLast = false,
  indented = false,
}: Readonly<MedicineRowProps>) {
  return (
    <li
      className={cn(
        isFirst && "rounded-t-lg",
        isLast && "rounded-b-lg",
        !isLast && "border-b border-border"
      )}
    >
      <Link
        to={`/medicine/${id}`}
        className={cn(
          "flex w-full items-center justify-between bg-card py-3 text-left transition-colors hover:bg-accent/30 active:bg-accent/50",
          indented ? "pl-10 pr-4" : "px-4",
          isFirst && "rounded-t-lg",
          isLast && "rounded-b-lg"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-foreground">{name}</p>
          {form && (
            <p className="truncate text-body-small text-muted-foreground">{form}</p>
          )}
        </div>
        <span
          className="ml-3 inline-flex min-w-[32px] items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-body font-bold text-foreground"
          aria-label={`${quantity} boxes`}
        >
          {quantity}
        </span>
      </Link>
    </li>
  );
}
