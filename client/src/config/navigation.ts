import type { LucideIcon } from "lucide-react"
import { Building2Icon, LayoutDashboardIcon, ShieldCheckIcon, UsersIcon } from "lucide-react"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  /** Only the owner account sees this item. */
  ownerOnly?: boolean
  /** Staff need this permission in the active branch to see it. */
  permission?: string
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export const APP_NAME = "Laundry Quick"

export const mainNav: NavGroup[] = [
  {
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboardIcon }],
  },
  {
    label: "Administration",
    items: [
      { title: "Branches", url: "/branches", icon: Building2Icon, ownerOnly: true },
      { title: "Roles & Permissions", url: "/roles", icon: ShieldCheckIcon, ownerOnly: true },
      { title: "Users", url: "/users", icon: UsersIcon, ownerOnly: true },
    ],
  },
]

const allItems = mainNav.flatMap((g) => g.items)

/** Title for the page header, based on the current path. */
export function getPageTitle(pathname: string): string {
  return allItems.find((item) => item.url === pathname)?.title ?? APP_NAME
}
