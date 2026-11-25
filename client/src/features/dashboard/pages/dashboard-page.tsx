import { Link } from "react-router"
import { ClipboardListIcon, FactoryIcon, HandCoinsIcon, PlusIcon, type LucideIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { BusinessDashboard } from "@/features/reports/components/business-dashboard"
import { useAuth } from "@/lib/auth/use-auth"

export function DashboardPage() {
  const { user, activeBranch, can } = useAuth()
  if (!user) return null

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of orders, sales and payments." />
      {!activeBranch ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyTitle>No branch selected</EmptyTitle>
            <EmptyDescription>Choose a branch from the branch switcher to see its dashboard.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : can("dashboard.view") ? (
        <BusinessDashboard />
      ) : (
        <QuickActions />
      )}
    </>
  )
}

const ACTIONS: {
  to: string
  title: string
  detail: string
  icon: LucideIcon
  permission: string
}[] = [
  {
    to: "/orders/new",
    title: "New order",
    detail: "Take in a customer's items",
    icon: PlusIcon,
    permission: "orders.create",
  },
  {
    to: "/orders",
    title: "Orders",
    detail: "Find and open an order",
    icon: ClipboardListIcon,
    permission: "orders.view",
  },
  {
    to: "/production",
    title: "Production",
    detail: "Move orders through the workshop",
    icon: FactoryIcon,
    permission: "production.view",
  },
  {
    to: "/collection",
    title: "Collection",
    detail: "Hand over ready orders",
    icon: HandCoinsIcon,
    permission: "collection.view",
  },
]

/** Staff without the business dashboard: shortcuts to the pages they use. */
function QuickActions() {
  const { can } = useAuth()
  const actions = ACTIONS.filter((a) => can(a.permission))
  if (!actions.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {actions.map(({ to, title, detail, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Card size="sm" className="transition-colors group-hover:bg-muted/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{detail}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  )
}
