import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Checks auth status on mount and redirects to /login if not authenticated.
 * Also redirects authenticated users away from /login.
 */
export function AuthGuard({ children }: Readonly<{ children: React.ReactNode }>) {
  const { initialized, authenticated, setStatus } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (initialized) return;

    api
      .get("/auth/status")
      .then((res) => {
        setStatus(res.data);
      })
      .catch(() => {
        // Backend unreachable — assume unauthenticated
        setStatus({ authenticated: false, hasPasskeys: false });
      });
  }, [initialized, setStatus]);

  useEffect(() => {
    if (!initialized) return;

    const isLoginPage = location.pathname === "/login";
    const isInvitePage = location.pathname.startsWith("/invite/");

    if (!authenticated && !isLoginPage && !isInvitePage) {
      navigate("/login", { replace: true });
    } else if (authenticated && isLoginPage) {
      navigate("/", { replace: true });
    }
  }, [initialized, authenticated, location.pathname, navigate]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
