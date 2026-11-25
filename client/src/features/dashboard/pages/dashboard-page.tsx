import { Link } from "react-router"
import { ArrowRightIcon, Building2Icon, ShieldCheckIcon, UsersIcon, type LucideIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetBranchesQuery } from "@/features/branches/api"
import { useGetRolesQuery } from "@/features/roles/api"
import { useGetStaffUsersQuery } from "@/features/users/api"
import { useAuth } from "@/lib/auth/use-auth"
import { BusinessDashboard } from "@/features/reports/components/business-dashboard"

export function DashboardPage() {
  const { user, activeBranch, can } = useAuth()
  if (!user) return null
  // the business dashboard needs a branch (its numbers are per branch) and dashboard.view
  const business = !!activeBranch && can("dashboard.view")

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of orders, sales and payments." />
      {business ? (
        <BusinessDashboard />
      ) : (
        <>
          <ManagementOverview />
          <StaffOverview />
        </>
      )}
    </>
  )
}

/** Counts for the admin areas the user can manage (owner, admin…). */
function ManagementOverview() {
  const { can } = useAuth()
  const cards = [
    can("branches.view") && <BranchesStat key="branches" />,
    can("roles.view") && <RolesStat key="roles" />,
    can("users.view") && <UsersStat key="users" />,
  ].filter(Boolean)
  if (!cards.length) return null
  return <div className="grid gap-4 sm:grid-cols-3">{cards}</div>
}

function BranchesStat() {
  const { data, isLoading } = useGetBranchesQuery()
  return (
    <StatCard
      title="Branches"
      icon={Building2Icon}
      to="/branches"
      loading={isLoading}
      value={data?.filter((b) => b.is_active).length}
      detail={data && `${data.length} total`}
    />
  )
}

function RolesStat() {
  const { data, isLoading } = useGetRolesQuery()
  return <StatCard title="Roles" icon={ShieldCheckIcon} to="/roles" loading={isLoading} value={data?.length} />
}

function UsersStat() {
  const { data, isLoading } = useGetStaffUsersQuery()
  return (
    <StatCard
      title="Staff"
      icon={UsersIcon}
      to="/users"
      loading={isLoading}
      value={data?.filter((u) => u.is_active).length}
      detail={data && `${data.length} total`}
    />
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
          Roles: {activeBranch.roles.map((r) => r.name).join(", ")}. Ask the owner if you need more access.
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
