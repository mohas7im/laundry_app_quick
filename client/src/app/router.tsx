import type { ComponentType } from "react"
import { createBrowserRouter } from "react-router"

import { FullPageSpinner, RequireAuth, RequireGuest, RequirePermission } from "@/components/auth/route-guards"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/features/auth/pages/login-page"
import { LOGIN_PATH } from "@/lib/auth/session"
import { NotFoundPage } from "@/pages/not-found-page"

/**
 * Lazy route: the page's code is downloaded the first time someone opens it, then cached
 * by the browser. The router loads it before switching pages, so the current page stays
 * on screen meanwhile (AppLayout shows a thin loading bar).
 *
 * The login page, layout and route guards stay in the main bundle: they're needed at once.
 */
function lazyPage<M>(load: () => Promise<M>, pick: (module: M) => ComponentType) {
  return async () => ({ Component: pick(await load()) })
}

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    hydrateFallbackElement: <FullPageSpinner />,
    children: [{ path: LOGIN_PATH, element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    // first load straight onto a lazy page (e.g. a refresh on /orders)
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [
          {
            index: true,
            lazy: lazyPage(() => import("@/features/dashboard/pages/dashboard-page"), (m) => m.DashboardPage),
          },

          // counter
          {
            element: <RequirePermission permission="orders.view" />,
            children: [
              { path: "orders", lazy: lazyPage(() => import("@/features/orders/pages/orders-page"), (m) => m.OrdersPage) },
              { path: "orders/:id", lazy: lazyPage(() => import("@/features/orders/pages/order-page"), (m) => m.OrderPage) },
            ],
          },
          {
            element: <RequirePermission permission="orders.create" />,
            children: [
              {
                path: "orders/new",
                lazy: lazyPage(() => import("@/features/orders/pages/new-order-page"), (m) => m.NewOrderPage),
              },
            ],
          },
          {
            element: <RequirePermission permission="customers.view" />,
            children: [
              {
                path: "customers",
                lazy: lazyPage(() => import("@/features/customers/pages/customers-page"), (m) => m.CustomersPage),
              },
            ],
          },

          // catalogue & pricing
          {
            element: <RequirePermission permission="services.view" />,
            children: [
              {
                path: "services",
                lazy: lazyPage(() => import("@/features/catalogue/pages/services-page"), (m) => m.ServicesPage),
              },
            ],
          },
          {
            element: <RequirePermission permission="items.view" />,
            children: [
              { path: "items", lazy: lazyPage(() => import("@/features/catalogue/pages/items-page"), (m) => m.ItemsPage) },
            ],
          },
          {
            element: <RequirePermission permission="price_lists.view" />,
            children: [
              {
                path: "price-lists",
                lazy: lazyPage(() => import("@/features/catalogue/pages/price-lists-page"), (m) => m.PriceListsPage),
              },
            ],
          },
          {
            // saving needs prices.edit; the grid is read-only without it
            element: <RequirePermission permission="prices.view" />,
            children: [
              { path: "prices", lazy: lazyPage(() => import("@/features/catalogue/pages/prices-page"), (m) => m.PricesPage) },
            ],
          },
          {
            element: <RequirePermission permission="upcharges.view" />,
            children: [
              {
                path: "upcharges",
                lazy: lazyPage(() => import("@/features/catalogue/pages/upcharges-page"), (m) => m.UpchargesPage),
              },
            ],
          },

          // administration
          {
            element: <RequirePermission permission="branches.view" />,
            children: [
              {
                path: "branches",
                lazy: lazyPage(() => import("@/features/branches/pages/branches-page"), (m) => m.BranchesPage),
              },
            ],
          },
          {
            element: <RequirePermission permission="roles.view" />,
            children: [
              { path: "roles", lazy: lazyPage(() => import("@/features/roles/pages/roles-page"), (m) => m.RolesPage) },
            ],
          },
          {
            // saving needs permissions.edit; the page is read-only without it
            element: <RequirePermission permission="permissions.view" />,
            children: [
              {
                path: "permissions",
                lazy: lazyPage(() => import("@/features/permissions/pages/permissions-page"), (m) => m.PermissionsPage),
              },
              {
                path: "permissions/:roleId",
                lazy: lazyPage(() => import("@/features/permissions/pages/permissions-page"), (m) => m.PermissionsPage),
              },
            ],
          },
          {
            element: <RequirePermission permission="users.view" />,
            children: [
              { path: "users", lazy: lazyPage(() => import("@/features/users/pages/users-page"), (m) => m.UsersPage) },
            ],
          },
          {
            element: <RequirePermission permission="common_masters.view" />,
            children: [
              {
                path: "common-masters",
                lazy: lazyPage(() => import("@/features/masters/pages/common-masters-page"), (m) => m.CommonMastersPage),
              },
            ],
          },
          {
            element: <RequirePermission permission="menus.view" />,
            children: [
              { path: "menus", lazy: lazyPage(() => import("@/features/menus/pages/menus-page"), (m) => m.MenusPage) },
            ],
          },
          {
            element: <RequirePermission permission="menus.create" />,
            children: [
              {
                path: "menus/new",
                lazy: lazyPage(() => import("@/features/menus/pages/menu-form-page"), (m) => m.MenuFormPage),
              },
            ],
          },
          {
            element: <RequirePermission permission="menus.edit" />,
            children: [
              {
                path: "menus/:id/edit",
                lazy: lazyPage(() => import("@/features/menus/pages/menu-form-page"), (m) => m.MenuFormPage),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
