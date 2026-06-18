import { createBrowserRouter, Navigate } from 'react-router-dom';

import { SAMPLE_ORG_SLUG } from '@/data';
import { ViewerLayout } from '@/viewer/ViewerLayout';
import { ViewerPage } from '@/viewer/ViewerPage';

/**
 * Client-side routes (React Router).
 *
 * Client-side routing keeps the app native-ready (Capacitor) and supports
 * per-workspace deep links of the form `/o/{slug}` and `/o/{slug}/{pageSlug}`.
 *
 * Phase 1 scope: the Viewer surface only. Auth, the Editor overlay, settings,
 * and invite flows are added in later phases as sibling routes.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    // No marketing site yet — send root to the bundled sample workspace.
    element: <Navigate to={`/o/${SAMPLE_ORG_SLUG}`} replace />,
  },
  {
    path: '/o/:slug',
    element: <ViewerLayout />,
    children: [
      { index: true, element: <ViewerPage /> },
      { path: ':pageSlug', element: <ViewerPage /> },
    ],
  },
  {
    path: '*',
    element: (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Page not found</p>
          <a href="/" className="mt-2 inline-block text-sm underline">
            Go home
          </a>
        </div>
      </div>
    ),
  },
]);
