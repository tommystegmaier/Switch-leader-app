import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import { EditModeProvider } from '@/editor/EditModeProvider';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/router';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EditModeProvider>
          <RouterProvider router={router} />
        </EditModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Keep the installed app fresh. The service worker (autoUpdate) skips waiting
// and claims clients, so when a new version activates it becomes the controller
// and we reload once. We also re-check for updates whenever the app regains
// focus — installed PWAs otherwise rarely check, which makes new deploys look
// like "it didn't update".
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.ready
    .then((reg) => {
      const check = () => { if (document.visibilityState === 'visible') void reg.update(); };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      // Check right away, then poll — so even a tab that stays open for hours
      // (a desktop browser left on the page) picks up new deploys on its own.
      check();
      setInterval(check, 60_000);
    })
    .catch(() => { /* no SW (e.g. dev) — ignore */ });
}
