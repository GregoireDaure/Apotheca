import { useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Fingerprint, UserPlus, FlaskConical } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { hasPasskeys, setAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  const handleRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Get registration options from server
      const optionsRes = await api.get("/auth/register/options", {
        params: label ? { label } : {},
      });
      const { options, challengeToken } = optionsRes.data;

      // 2. Start registration ceremony (triggers Face ID / biometric)
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Send result to server for verification
      await api.post("/auth/register/verify", {
        challengeToken,
        credential,
        label: label || undefined,
      });

      setAuthenticated();
      navigate("/");
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

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Get authentication options
      const optionsRes = await api.get("/auth/login/options");
      const { options, challengeToken } = optionsRes.data;

      // 2. Start authentication ceremony (triggers Face ID / biometric)
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server
      await api.post("/auth/login/verify", {
        challengeToken,
        credential,
      });

      setAuthenticated();
      navigate("/");
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError("Biometric authentication was cancelled.");
        } else {
          setError(err.message || "Authentication failed");
        }
      } else {
        setError("Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <FlaskConical className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-heading-1 text-foreground">
            Apotheca
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            Your digital medicine cabinet
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-status-danger-bg px-4 py-3">
            <p className="text-body-small text-status-danger">{error}</p>
          </div>
        )}

        {!hasPasskeys ? (
          /* First-time setup — register first passkey */
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
              <div className="text-center">
                <UserPlus className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="mt-2 text-heading-3 text-foreground">
                  Welcome! Set up your passkey
                </h2>
                <p className="mt-1 text-body-small text-muted-foreground">
                  Use Face ID or fingerprint to secure your cabinet.
                  No password needed.
                </p>
              </div>

              <div>
                <Label htmlFor="label" className="text-body-small">
                  Device label (optional)
                </Label>
                <Input
                  id="label"
                  className="mt-1"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Greg's iPhone"
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
                Register Passkey
              </Button>
            </div>
          </div>
        ) : (
          /* Login — authenticate with existing passkey */
          <div className="space-y-4">
            <Button
              className="w-full h-14 text-body font-semibold"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Fingerprint className="mr-2 h-6 w-6" />
              )}
              Sign in with Passkey
            </Button>

            <p className="text-center text-body-small text-muted-foreground">
              Use Face ID or fingerprint to unlock
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
