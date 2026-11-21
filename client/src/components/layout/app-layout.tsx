import type { CSSProperties } from "react"
import { Outlet } from "react-router"
import { Building2Icon } from "lucide-react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-context"

function NoBranchAssigned() {
  const { logout } = useAuth()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <Building2Icon className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">No branch assigned</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your account isn't linked to an active branch yet. Ask the shop owner to assign you one.
      </p>
      <Button variant="outline" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  )
}

export function AppLayout() {
  const { user, activeBranch } = useAuth()

  // Staff need a branch to work in; users with organization-wide roles (e.g. the owner
  // before any branch exists) can still reach the admin pages.
  if (user && !activeBranch && user.permissions.length === 0) return <NoBranchAssigned />

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
