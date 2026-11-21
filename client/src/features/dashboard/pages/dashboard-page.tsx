import { Link } from "react-router"
import { ArrowRightIcon, Building2Icon, ShieldCheckIcon, UsersIcon, type LucideIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useBranches } from "@/features/branches/api"
import { useRoles } from "@/features/roles/api"
import { useStaffUsers } from "@/features/users/api"
import { useAuth } from "@/lib/auth/auth-context"

export function DashboardPage() {
  const { user, activeBranch } = useAuth()
  if (!user) return null

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.full_name.split(" ")[0]}`}
        description={
          activeBranch
            ? `You're working in ${activeBranch.name}${activeBranch.role ? ` as ${activeBranch.role.name}` : ""}.`
            : "Create your first branch to get started."
        }
      />
      {user.is_owner ? <OwnerOverview /> : <StaffOverview />}
    </>
  )
}

function OwnerOverview() {
  const branches = useBranches()
  const roles = useRoles()
  const users = useStaffUsers()

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        title="Branches"
        icon={Building2Icon}
        to="/branches"
        loading={branches.isLoading}
        value={branches.data?.filter((b) => b.is_active).length}
        detail={branches.data && `${branches.data.length} total`}
      />
      <StatCard
        title="Roles"
        icon={ShieldCheckIcon}
        to="/roles"
        loading={roles.isLoading}
        value={roles.data?.length}
      />
      <StatCard
        title="Staff"
        icon={UsersIcon}
        to="/users"
        loading={users.isLoading}
        value={users.data?.filter((u) => u.is_active).length}
        detail={users.data && `${users.data.length} total`}
      />
    </div>
  )
}

function StatCard({
  title,
  icon: Icon,
  to,
  loading,
  value,
  detail,
}: {
  title: string
  icon: LucideIcon
  to: string
  loading: boolean
  value?: number
  detail?: string
}) {
  return (
    <Link to={to} className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <Card className="transition-colors group-hover:bg-muted/40">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Icon className="size-4" />
            {value === undefined || title === "Roles" ? title : `Active ${title.toLowerCase()}`}
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {loading ? <Skeleton className="h-9 w-12" /> : (value ?? "—")}
          </CardTitle>
          <CardAction>
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </CardAction>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </CardHeader>
      </Card>
    </Link>
  )
}

function StaffOverview() {
  const { activeBranch } = useAuth()
  if (!activeBranch) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your access in {activeBranch.name}</CardTitle>
        <CardDescription>
          Role: {activeBranch.role?.name}. Ask the owner if you need more access.
        </CardDescription>
        <div className="mt-2 flex flex-wrap gap-1">
          {activeBranch.permissions.length ? (
            activeBranch.permissions.map((p) => (
              <Badge key={p} variant="secondary">
                {p}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No permissions yet.</span>
          )}
        </div>
      </CardHeader>
    </Card>
  )
}
