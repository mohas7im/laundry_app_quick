import { createBrowserRouter } from "react-router"

import { RequireAuth, RequireGuest, RequirePermission } from "@/components/auth/route-guards"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/features/auth/pages/login-page"
import { BranchesPage } from "@/features/branches/pages/branches-page"
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page"
import { RolesPage } from "@/features/roles/pages/roles-page"
import { UsersPage } from "@/features/users/pages/users-page"
import { LOGIN_PATH } from "@/lib/auth/session"
import { NotFoundPage } from "@/pages/not-found-page"

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [{ path: LOGIN_PATH, element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            element: <RequirePermission permission="branches.manage" />,
            children: [{ path: "branches", element: <BranchesPage /> }],
          },
          {
            element: <RequirePermission permission="roles.manage" />,
            children: [{ path: "roles", element: <RolesPage /> }],
          },
          {
            element: <RequirePermission permission="users.manage" />,
            children: [{ path: "users", element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
