import type { LucideIcon } from "lucide-react"
import {
  BarChart3Icon,
  CircleHelpIcon,
  LayoutDashboardIcon,
  PackageCheckIcon,
  SearchIcon,
  Settings2Icon,
  ShirtIcon,
  TagsIcon,
  UserCogIcon,
  UsersIcon,
  WashingMachineIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export const APP_NAME = "Laundry Quick"

/** Primary call-to-action shown at the top of the sidebar. */
export const newOrderItem: NavItem = {
  title: "New Order",
  url: "/orders/new",
  icon: ShirtIcon,
}

export const mainNav: NavGroup[] = [
  {
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboardIcon },
      { title: "Cleaning", url: "/orders/cleaning", icon: WashingMachineIcon },
      { title: "Ready", url: "/orders/ready", icon: PackageCheckIcon },
      { title: "Search", url: "/search", icon: SearchIcon },
      { title: "Customers", url: "/customers", icon: UsersIcon },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Products", url: "/products", icon: TagsIcon },
      { title: "Users", url: "/users", icon: UserCogIcon },
      { title: "Reports", url: "/reports", icon: BarChart3Icon },
    ],
  },
]

export const secondaryNav: NavItem[] = [
  { title: "Settings", url: "/settings", icon: Settings2Icon },
  { title: "Help", url: "/help", icon: CircleHelpIcon },
]

const allItems = [newOrderItem, ...mainNav.flatMap((g) => g.items), ...secondaryNav]

/** Title for the page header, based on the current path. */
export function getPageTitle(pathname: string): string {
  return allItems.find((item) => item.url === pathname)?.title ?? APP_NAME
}
