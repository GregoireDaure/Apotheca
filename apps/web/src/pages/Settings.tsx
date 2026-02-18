import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { startRegistration } from "@simplewebauthn/browser";
import { Separator } from "@/components/ui/separator";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { Fingerprint, Plus, LogOut, Smartphone, Bell, BellOff, UserPlus, Copy, Check } from "lucide-react";

interface Passkey {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [addLabel, setAddLabel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Invite state ---
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  // --- Push notification state ---
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  const togglePush = useCallback(async () => {
    setPushLoading(true);
    setPushError(null);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (pushEnabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.post("/notifications/unsubscribe", { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        // Subscribe
        const { data } = await api.get("/notifications/vapid-public-key");
        if (!data.key) {
          setPushError("Push notifications not configured on server");
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushError("Notification permission denied");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: data.key,
        });
        const json = sub.toJSON();
        await api.post("/notifications/subscribe", {
          endpoint: sub.endpoint,
          keys: json.keys,
        });
        setPushEnabled(true);
      }
    } catch (err: any) {
      setPushError(err?.message || "Failed to toggle notifications");
    } finally {
      setPushLoading(false);
    }
  }, [pushEnabled]);

  const generateInvite = useCallback(async () => {
    setInviteLoading(true);
    try {
      const { data } = await api.post("/auth/invite");
      const link = `${window.location.origin}/invite/${data.code}`;
      setInviteLink(link);
      setInviteCopied(false);
    } catch {
      setError("Failed to generate invite link");
    } finally {
      setInviteLoading(false);
    }
  }, []);

  const copyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
    }
  }, [inviteLink]);

  // --- Passkeys ---
  const { data: passkeys = [], isLoading } = useQuery<Passkey[]>({
    queryKey: ["passkeys"],
    queryFn: () => api.get("/auth/passkeys").then((r) => r.data),
  });

  const addPasskeyMutation = useMutation({
    mutationFn: async (label: string) => {
      const optionsRes = await api.get("/auth/register/options");
      const attResp = await startRegistration({ optionsJSON: optionsRes.data });
      await api.post("/auth/register/verify", { response: attResp, label });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      setShowAddForm(false);
      setAddLabel("");
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || "Failed to add passkey");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  function handleAddPasskey(e: React.FormEvent) {
    e.preventDefault();
    addPasskeyMutation.mutate(addLabel || "My Device");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-heading-1 text-foreground">Settings</h1>

      {/* Passkeys / Account */}
      <div className="rounded-xl border bg-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-body font-medium text-foreground flex items-center gap-2">
              <Fingerprint className="h-4 w-4" /> Passkeys
            </p>
            <p className="text-body-small text-muted-foreground">
              Manage devices that can unlock this app
            </p>
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground active:scale-95 transition-transform"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>

        {showAddForm && (
          <>
            <Separator />
            <form onSubmit={handleAddPasskey} className="px-5 py-4 space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Device label
              </label>
              <input
                type="text"
                placeholder="e.g. Mom's iPhone"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addPasskeyMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {addPasskeyMutation.isPending ? "Registering…" : "Register passkey"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setError(null); }}
                  className="rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}

        <Separator />

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : passkeys.length === 0 ? (
          <div className="px-5 py-6 text-center text-body-small text-muted-foreground">
            No passkeys registered
          </div>
        ) : (
          <div>
            {passkeys.map((pk, i) => (
              <div key={pk.id}>
                {i > 0 && <Separator />}
                <div className="flex items-center gap-3 px-5 py-3">
                  <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {pk.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(pk.createdAt).toLocaleDateString()}
                      {pk.lastUsedAt &&
                        ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite member */}
      <div className="rounded-xl border bg-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-body font-medium text-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Invite member
            </p>
            <p className="text-body-small text-muted-foreground">
              Generate a link so someone can register their own passkey
            </p>
          </div>
          {!inviteLink && (
            <button
              onClick={generateInvite}
              disabled={inviteLoading}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground active:scale-95 transition-transform disabled:opacity-50"
            >
              {inviteLoading ? "…" : "Generate"}
            </button>
          )}
        </div>

        {inviteLink && (
          <>
            <Separator />
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Share this link — it expires in 10 minutes:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border bg-muted px-3 py-2 text-xs break-all select-all">
                  {inviteLink}
                </code>
                <button
                  onClick={copyInviteLink}
                  className="shrink-0 rounded-lg border p-2 active:scale-95 transition-transform"
                  aria-label="Copy link"
                >
                  {inviteCopied ? (
                    <Check className="h-4 w-4 text-status-green" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <button
                onClick={() => setInviteLink(null)}
                className="text-xs text-muted-foreground underline"
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>

      {/* Notifications */}
      <div className="rounded-xl border bg-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-body font-medium text-foreground flex items-center gap-2">
              {pushEnabled ? (
                <Bell className="h-4 w-4 text-status-green" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              Push Notifications
            </p>
            <p className="text-body-small text-muted-foreground">
              {!pushSupported
                ? "Not supported in this browser"
                : pushEnabled
                  ? "You'll get daily alerts for expiring medicines"
                  : "Enable to receive expiry & restock alerts"}
            </p>
          </div>
          {pushSupported && (
            <button
              onClick={togglePush}
              disabled={pushLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                pushEnabled ? "bg-primary" : "bg-muted"
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  pushEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          )}
        </div>
        {pushError && (
          <div className="px-5 pb-3">
            <p className="text-xs text-destructive">{pushError}</p>
          </div>
        )}
      </div>

      {/* About */}
      <div className="rounded-xl border bg-card shadow-card">
        <div className="px-5 py-4">
          <p className="text-body font-medium text-foreground">About</p>
          <p className="text-body-small text-muted-foreground">
            Apotheca v1.0.0 — Your personal apothecary
          </p>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 py-3 text-sm font-medium text-destructive active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
        {logoutMutation.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
