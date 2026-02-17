import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Shell } from './components/layout/Shell';
import { AuthGuard } from './components/auth/AuthGuard';
import { lazy, Suspense } from 'react';
import Dashboard from './pages/Dashboard';
import { createIDBPersister } from './lib/idb-persister';

// Lazy-load heavy pages
const Scan = lazy(() => import('./pages/Scan'));
const MedicineDetail = lazy(() => import('./pages/MedicineDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const Notifications = lazy(() => import('./pages/Notifications'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000, // 10s — keep data fresh for responsive feel
      retry: 1,
      gcTime: 1000 * 60 * 60 * 24, // 24h — keep cached data for offline use
      refetchOnWindowFocus: true, // Refresh when user returns to the app
      refetchOnReconnect: true, // Refresh when network comes back
    },
  },
});

const persister = createIDBPersister();

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24h
        buster: '', // Cache buster string — bump on breaking schema changes
      }}
    >
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/login" element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
            <Route path="/" element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="scan" element={<Suspense fallback={<PageFallback />}><Scan /></Suspense>} />
              <Route path="medicine/:id" element={<Suspense fallback={<PageFallback />}><MedicineDetail /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
              <Route path="notifications" element={<Suspense fallback={<PageFallback />}><Notifications /></Suspense>} />
            </Route>
          </Routes>
        </AuthGuard>
        <Toaster
          position="top-center"
          toastOptions={{
            className: 'font-sans',
            duration: 3000,
          }}
          richColors
          closeButton
        />
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}

export default App;
