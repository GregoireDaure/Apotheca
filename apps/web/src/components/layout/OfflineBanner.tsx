import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Slim banner shown at the top of the app when the device is offline.
 * Data is still readable from the service worker cache.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-status-warning-bg px-4 py-2 text-body-small font-medium text-status-warning"
    >
      <WifiOff className="h-4 w-4" />
      <span>You're offline — showing cached data</span>
    </div>
  );
}
