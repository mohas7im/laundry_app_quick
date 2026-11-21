import { useLocation } from "react-router"

import { BranchSwitcher } from "@/components/layout/branch-switcher"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { APP_NAME } from "@/config/navigation"
import { useMyMenus } from "@/features/menus/api"
import { findMenuForPath } from "@/features/menus/lib/match"

export function SiteHeader() {
  const { pathname } = useLocation()
  const { data: menus } = useMyMenus()
  // the page's menu name, also on pages under its link (e.g. /permissions/<id> → Permissions)
  const title = findMenuForPath(menus, pathname)?.name ?? APP_NAME

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto">
          <BranchSwitcher />
        </div>
      </div>
    </header>
  )
}
