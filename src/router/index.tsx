import { createBrowserRouter } from 'react-router-dom';

import { JoinPage } from '@/auth/JoinPage';
import { LoginPage } from '@/auth/LoginPage';
import { CreateWorkspacePage } from '@/creator/CreateWorkspacePage';
import { HomeRoute, WorkspacesRoute } from '@/creator/HomeRoute';
import { SettingsPage } from '@/editor/SettingsPage';
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
    element: <HomeRoute />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/workspaces',
    element: <WorkspacesRoute />,
  },
  {
    path: '/new',
    element: <CreateWorkspacePage />,
  },
  {
    path: '/join',
    element: <JoinPage />,
  },
  {
    path: '/o/:slug',
    element: <ViewerLayout />,
    children: [
      { index: true, element: <ViewerPage /> },
      // Static 'settings' is matched before the dynamic :pageSlug.
      { path: 'settings', element: <SettingsPage /> },
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
