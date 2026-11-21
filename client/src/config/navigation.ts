import type { LucideIcon } from "lucide-react"
import { Building2Icon, LayoutDashboardIcon, ShieldCheckIcon, UsersIcon } from "lucide-react"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  /** Shown only to users with this permission. */
  permission?: string
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export const APP_NAME = "Comfort"

export const mainNav: NavGroup[] = [
  {
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboardIcon }],
  },
  {
    label: "Administration",
    items: [
      { title: "Branches", url: "/branches", icon: Building2Icon, permission: "branches.manage" },
      { title: "Roles & Permissions", url: "/roles", icon: ShieldCheckIcon, permission: "roles.manage" },
      { title: "Users", url: "/users", icon: UsersIcon, permission: "users.manage" },
    ],
  },
]

const allItems = mainNav.flatMap((g) => g.items)

/** Title for the page header, based on the current path. */
export function getPageTitle(pathname: string): string {
  return allItems.find((item) => item.url === pathname)?.title ?? APP_NAME
}
