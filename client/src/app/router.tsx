import { createBrowserRouter } from "react-router"

import { RequireAuth, RequireGuest, RequireOwner } from "@/components/auth/route-guards"
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
            element: <RequireOwner />,
            children: [
              { path: "branches", element: <BranchesPage /> },
              { path: "roles", element: <RolesPage /> },
              { path: "users", element: <UsersPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
