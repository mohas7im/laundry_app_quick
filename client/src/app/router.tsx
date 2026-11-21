import { createBrowserRouter } from "react-router"

import { RequireAuth, RequireGuest, RequirePermission } from "@/components/auth/route-guards"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/features/auth/pages/login-page"
import { BranchesPage } from "@/features/branches/pages/branches-page"
import { CustomersPage } from "@/features/customers/pages/customers-page"
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page"
import { MenuFormPage } from "@/features/menus/pages/menu-form-page"
import { MenusPage } from "@/features/menus/pages/menus-page"
import { PermissionsPage } from "@/features/permissions/pages/permissions-page"
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
            element: <RequirePermission permission="customers.view" />,
            children: [{ path: "customers", element: <CustomersPage /> }],
          },
          {
            element: <RequirePermission permission="branches.view" />,
            children: [{ path: "branches", element: <BranchesPage /> }],
          },
          {
            element: <RequirePermission permission="roles.view" />,
            children: [{ path: "roles", element: <RolesPage /> }],
          },
          {
            // saving needs permissions.edit; the page is read-only without it
            element: <RequirePermission permission="permissions.view" />,
            children: [
              { path: "permissions", element: <PermissionsPage /> },
              { path: "permissions/:roleId", element: <PermissionsPage /> },
            ],
          },
          {
            element: <RequirePermission permission="users.view" />,
            children: [{ path: "users", element: <UsersPage /> }],
          },
          {
            element: <RequirePermission permission="menus.view" />,
            children: [{ path: "menus", element: <MenusPage /> }],
          },
          {
            element: <RequirePermission permission="menus.create" />,
            children: [{ path: "menus/new", element: <MenuFormPage /> }],
          },
          {
            element: <RequirePermission permission="menus.edit" />,
            children: [{ path: "menus/:id/edit", element: <MenuFormPage /> }],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
