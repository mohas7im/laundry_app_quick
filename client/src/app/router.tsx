import { createBrowserRouter } from "react-router"

import { AppLayout } from "@/components/layout/app-layout"
import { mainNav, newOrderItem, secondaryNav } from "@/config/navigation"
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { PlaceholderPage } from "@/pages/placeholder-page"

// Every menu item except Dashboard gets a placeholder until its feature is built.
const placeholderRoutes = [newOrderItem, ...mainNav.flatMap((g) => g.items), ...secondaryNav]
  .filter((item) => item.url !== "/")
  .map((item) => ({
    path: item.url.slice(1),
    element: <PlaceholderPage title={item.title} />,
  }))

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [{ index: true, element: <DashboardPage /> }, ...placeholderRoutes],
  },
  { path: "*", element: <NotFoundPage /> },
])
