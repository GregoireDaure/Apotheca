import { Link, Outlet, useLocation } from "react-router-dom";
import { Home, Camera, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { OfflineBanner } from "./OfflineBanner";

export function Shell() {
  const location = useLocation();

  const navItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "Scan", href: "/scan", icon: Camera, isCenter: true },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background pb-[70px]">
      {/* Offline banner */}
      <OfflineBanner />

      {/* Main content */}
      <main className="mx-auto max-w-[640px] px-4 pt-6">
        <Outlet />
      </main>

      {/* Bottom navigation bar */}
      <nav
        role="navigation"
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex h-[60px] max-w-[640px] items-center justify-around px-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;

            if (item.isCenter) {
              // Raised center scan button
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "relative -mt-6 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95",
                    "bg-primary text-primary-foreground"
                  )}
                  aria-label={item.name}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-6 w-6" />
                </Link>
              );
            }

            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "relative flex min-w-[44px] flex-col items-center gap-1 py-1 text-caption transition-colors",
                  isActive
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                </span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
