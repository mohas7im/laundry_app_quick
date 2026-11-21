import { LoaderIcon } from "lucide-react"
import { Navigate, Outlet, useLocation } from "react-router"

import { useAuth } from "@/lib/auth/auth-context"
import { LOGIN_PATH } from "@/lib/auth/session"

function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <LoaderIcon className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

/** Logged-in users only; others go to /login?next=<here>. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === "loading") return <FullPageSpinner />
  if (status === "anonymous") {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${LOGIN_PATH}?next=${next}`} replace />
  }
  return <Outlet />
}

/** Logged-out users only (the login page); logged-in users go to the dashboard. */
export function RequireGuest() {
  const { status } = useAuth()

  if (status === "loading") return <FullPageSpinner />
  if (status === "authenticated") return <Navigate to="/" replace />
  return <Outlet />
}

/** Users with this permission only; others go to the dashboard. */
export function RequirePermission({ permission }: { permission: string }) {
  const { can } = useAuth()
  if (!can(permission)) return <Navigate to="/" replace />
  return <Outlet />
}
