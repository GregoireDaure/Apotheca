import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { startRegistration } from "@simplewebauthn/browser";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Fingerprint, FlaskConical, UserPlus, Clock, XCircle } from "lucide-react";

type InviteStatus = "loading" | "valid" | "expired" | "error";

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { setAuthenticated } = useAuthStore();

  const [status, setStatus] = useState<InviteStatus>("loading");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate invite code on mount
  useEffect(() => {
    if (!code) {
      setStatus("error");
      return;
    }

    api
      .get(`/auth/invite/${code}/validate`)
      .then((res) => {
        if (res.data.valid) {
          setStatus("valid");
          setRemainingSeconds(res.data.remainingSeconds);
        } else {
          setStatus("expired");
        }
      })
      .catch(() => setStatus("error"));
  }, [code]);

  // Countdown timer
  useEffect(() => {
    if (status !== "valid" || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, remainingSeconds]);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Get registration options via invite endpoint
      const optionsRes = await api.get(
        `/auth/invite/${code}/register/options`,
        { params: label ? { label } : {} },
      );
      const { options, challengeToken } = optionsRes.data;

      // 2. Start registration ceremony (triggers Face ID / biometric)
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Verify registration and consume invite code
      await api.post(`/auth/invite/${code}/register/verify`, {
        challengeToken,
        credential,
        label: label || undefined,
      });

      setAuthenticated();
      navigate("/", { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError("Biometric authentication was cancelled.");
        } else {
          setError(err.message || "Registration failed");
        }
      } else {
        setError("Registration failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <FlaskConical className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-heading-1 text-foreground">Apotheca</h1>
          <p className="mt-1 text-body text-muted-foreground">
            You've been invited to join a medicine cabinet
          </p>
        </div>

        {status === "loading" && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {status === "expired" && (
          <div className="rounded-xl border bg-card p-6 shadow-card text-center space-y-3">
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="text-heading-3 text-foreground">Link expired</h2>
            <p className="text-body-small text-muted-foreground">
              This invite link has expired. Please ask the household owner to
              generate a new one.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border bg-card p-6 shadow-card text-center space-y-3">
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="text-heading-3 text-foreground">Invalid link</h2>
            <p className="text-body-small text-muted-foreground">
              This invite link is not valid. Please check the link and try again.
            </p>
          </div>
        )}

        {status === "valid" && (
          <div className="space-y-4">
            {/* Timer */}
            <div className="flex items-center justify-center gap-2 text-body-small text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expires in {formatTime(remainingSeconds)}</span>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
              <div className="text-center">
                <UserPlus className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="mt-2 text-heading-3 text-foreground">
                  Set up your passkey
                </h2>
                <p className="mt-1 text-body-small text-muted-foreground">
                  Use Face ID or fingerprint to access the shared medicine
                  cabinet. No password needed.
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-status-danger-bg px-4 py-3">
                  <p className="text-body-small text-status-danger">{error}</p>
                </div>
              )}

              <div>
                <Label htmlFor="invite-label" className="text-body-small">
                  Your name or device (optional)
                </Label>
                <Input
                  id="invite-label"
                  className="mt-1"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Marie's iPhone"
                />
              </div>

              <Button
                className="w-full h-12"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="mr-2 h-5 w-5" />
                )}
                Register My Passkey
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
