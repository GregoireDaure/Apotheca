import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Package,
  CheckCheck,
  Bell,
} from "lucide-react";

interface AppNotification {
  id: string;
  type: "expiring" | "expired" | "restock";
  title: string;
  body: string;
  inventoryItemId: string | null;
  read: boolean;
  createdAt: string;
}

const typeConfig = {
  expiring: { icon: Clock, color: "text-status-amber", bg: "bg-status-amber/10" },
  expired: { icon: AlertTriangle, color: "text-status-red", bg: "bg-status-red/10" },
  restock: { icon: Package, color: "text-status-blue", bg: "bg-status-blue/10" },
} as const;

export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<AppNotification[]>({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => r.data),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post("/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleClick(notif: AppNotification) {
    if (!notif.read) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.inventoryItemId) {
      navigate(`/medicine/${notif.inventoryItemId}`);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-heading-1 text-foreground">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="flex items-center gap-1 text-sm font-medium text-primary active:scale-95 transition-transform"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Bell className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-body font-medium text-foreground">All clear!</p>
          <p className="text-body-small text-muted-foreground max-w-xs mt-1">
            You'll see alerts here when medicines are expiring or running low.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const cfg = typeConfig[notif.type];
            const Icon = cfg.icon;

            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left rounded-xl border bg-card p-4 shadow-card transition-all active:scale-[0.98] ${
                  !notif.read ? "border-primary/20" : "opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notif.body}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {new Date(notif.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
