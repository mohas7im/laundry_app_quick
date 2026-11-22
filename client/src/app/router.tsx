import { createBrowserRouter } from "react-router"

import { RequireAuth, RequireGuest, RequirePermission } from "@/components/auth/route-guards"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/features/auth/pages/login-page"
import { BranchesPage } from "@/features/branches/pages/branches-page"
import { ItemsPage } from "@/features/catalogue/pages/items-page"
import { PriceListsPage } from "@/features/catalogue/pages/price-lists-page"
import { PricesPage } from "@/features/catalogue/pages/prices-page"
import { ServicesPage } from "@/features/catalogue/pages/services-page"
import { UpchargesPage } from "@/features/catalogue/pages/upcharges-page"
import { CustomersPage } from "@/features/customers/pages/customers-page"
import { NewOrderPage } from "@/features/orders/pages/new-order-page"
import { OrderPage } from "@/features/orders/pages/order-page"
import { OrdersPage } from "@/features/orders/pages/orders-page"
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
            element: <RequirePermission permission="orders.view" />,
            children: [
              { path: "orders", element: <OrdersPage /> },
              { path: "orders/:id", element: <OrderPage /> },
            ],
          },
          {
            element: <RequirePermission permission="orders.create" />,
            children: [{ path: "orders/new", element: <NewOrderPage /> }],
          },
          {
            element: <RequirePermission permission="customers.view" />,
            children: [{ path: "customers", element: <CustomersPage /> }],
          },
          // catalogue & pricing
          {
            element: <RequirePermission permission="services.view" />,
            children: [{ path: "services", element: <ServicesPage /> }],
          },
          {
            element: <RequirePermission permission="items.view" />,
            children: [{ path: "items", element: <ItemsPage /> }],
          },
          {
            element: <RequirePermission permission="price_lists.view" />,
            children: [{ path: "price-lists", element: <PriceListsPage /> }],
          },
          {
            // saving needs prices.edit; the grid is read-only without it
            element: <RequirePermission permission="prices.view" />,
            children: [{ path: "prices", element: <PricesPage /> }],
          },
          {
            element: <RequirePermission permission="upcharges.view" />,
            children: [{ path: "upcharges", element: <UpchargesPage /> }],
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
