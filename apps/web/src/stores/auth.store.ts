import { create } from 'zustand';

interface AuthState {
  /** Whether the auth status has been checked */
  initialized: boolean;
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** Whether any passkeys exist (false = first-time setup) */
  hasPasskeys: boolean;
  /** Set auth status after checking */
  setStatus: (status: { authenticated: boolean; hasPasskeys: boolean }) => void;
  /** Mark as authenticated after login/register */
  setAuthenticated: () => void;
  /** Clear auth state on logout */
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  initialized: false,
  authenticated: false,
  hasPasskeys: false,
  setStatus: ({ authenticated, hasPasskeys }) =>
    set({ initialized: true, authenticated, hasPasskeys }),
  setAuthenticated: () =>
    set({ authenticated: true, hasPasskeys: true }),
  clearAuth: () =>
    set({ authenticated: false }),
}));
