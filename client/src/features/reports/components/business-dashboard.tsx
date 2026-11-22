import { Link } from "react-router"
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, RefreshCwIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fromCents, toCents } from "@/features/orders/lib/pricing"
import { getApiErrorMessage } from "@/lib/api/errors"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getDashboard } from "../services/reports.service"
import type { Dashboard } from "../types"

const dayName = shopDateFormat({ weekday: "short", day: "numeric", month: "short" })
const time = shopDateFormat({ weekday: "short", hour: "numeric", minute: "2-digit" })

type Light = "good" | "watch" | "bad" | "none"

const LIGHT_CLASS: Record<Light, string> = {
  good: "bg-emerald-500",
  watch: "bg-amber-500",
  bad: "bg-destructive",
  none: "bg-muted-foreground/40",
}

function Dot({ light, label }: { light: Light; label: string }) {
  return <span role="img" aria-label={label} className={`inline-block size-2.5 rounded-full ${LIGHT_CLASS[light]}`} />
}

/** Today vs yesterday: ↑ 12% / ↓ 5% / same. */
function Change({ today, yesterday }: { today: number; yesterday: number }) {
  if (!yesterday) return <span className="text-muted-foreground">No sales yesterday</span>
  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  if (pct === 0) return <span className="text-muted-foreground">Same as yesterday</span>
  const Icon = pct > 0 ? ArrowUpIcon : ArrowDownIcon
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Icon className="size-3" />
      {Math.abs(pct)}% vs yesterday
    </span>
  )
}

function Tile({
  title,
  value,
  light,
  lightLabel,
  children,
}: {
  title: string
  value: React.ReactNode
  light?: Light
  lightLabel?: string
  children?: React.ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {light && <Dot light={light} label={lightLabel ?? light} />}
          {title}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {children && <CardContent className="text-xs">{children}</CardContent>}
    </Card>
  )
}

/** The active branch at a glance (dashboard.view): today, the workshop, money owed, the week. */
export function BusinessDashboard() {
  const dashboard = useRecords(getDashboard, null as Dashboard | null)

  if (dashboard.loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    )
  }
  if (dashboard.error || !dashboard.data) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Couldn't load the dashboard</EmptyTitle>
          <EmptyDescription>{getApiErrorMessage(dashboard.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={dashboard.retry}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const d = dashboard.data
  const ops = d.operations
  const onTime = d.on_time_30_days.percent
  const onTimeLight: Light = onTime === null ? "none" : onTime >= 90 ? "good" : onTime >= 75 ? "watch" : "bad"
  const shortCashUps = d.cash_ups_today.filter((s) => toCents(s.difference ?? "0") < 0)
  const owed = toCents(d.receivables.total)
  const oldOwed = d.receivables.aging.slice(2).reduce((sum, a) => sum + toCents(a.amount), 0) // 61+ days

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {d.branch_name} · {dayName.format(new Date(`${d.date}T12:00:00Z`))}
        </p>
        <Button variant="outline" size="sm" onClick={() => void dashboard.reload()}>
          <RefreshCwIcon data-icon="inline-start" />
          Refresh
        </Button>
      </div>

      {/* today */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile title="Sales today" value={formatMoney(d.today.sales.sales)}>
          <div className="grid gap-0.5">
            <Change today={toCents(d.today.sales.sales)} yesterday={toCents(d.yesterday.sales.sales)} />
            <span className="text-muted-foreground">{formatMoney(d.today.sales.sales_excl_vat)} without VAT</span>
          </div>
        </Tile>
        <Tile title="Money collected today" value={formatMoney(d.today.collected.net)}>
          <span className="text-muted-foreground">
            {d.today.collected.methods.length
              ? d.today.collected.methods.map((m) => `${m.method_name} ${formatMoney(m.net)}`).join(" · ")
              : "Nothing collected yet"}
          </span>
        </Tile>
        <Tile title="Orders today" value={d.today.sales.orders}>
          <span className="text-muted-foreground">
            {d.today.sales.pieces} pieces · average {formatMoney(d.today.sales.average_order)}
            {d.today.sales.express_orders > 0 && ` · ${d.today.sales.express_orders} express`}
          </span>
        </Tile>
        <Tile
          title="Ready on time (30 days)"
          value={onTime === null ? "—" : `${onTime}%`}
          light={onTimeLight}
          lightLabel={onTimeLight === "good" ? "Good" : onTimeLight === "watch" ? "Watch" : onTimeLight === "bad" ? "Needs attention" : "No data"}
        >
          <span className="text-muted-foreground">
            {d.on_time_30_days.ready
              ? `${d.on_time_30_days.on_time} of ${d.on_time_30_days.ready} orders ready by their time`
              : "No orders ready yet"}
          </span>
        </Tile>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* the workshop */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dot light={ops.overdue ? "bad" : "good"} label={ops.overdue ? "Overdue orders" : "Nothing overdue"} />
              Workshop now
            </CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/production" />}>
                Production
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {ops.wip.map((w) => (
                <div key={w.code} className="grid min-w-20 rounded-lg border px-3 py-2">
                  <span className="text-xs text-muted-foreground">{w.name}</span>
                  <span className="text-lg font-semibold tabular-nums">{w.orders}</span>
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between">
              <span>Overdue</span>
              <span className={`font-semibold tabular-nums ${ops.overdue ? "text-destructive" : ""}`}>
                {ops.overdue}
                {ops.overdue_express > 0 && ` (${ops.overdue_express} express)`}
              </span>
            </div>
            {ops.oldest_overdue && (
              <p className="-mt-3 text-xs text-muted-foreground">
                Oldest: {ops.oldest_overdue.number}, due {time.format(new Date(ops.oldest_overdue.ready_by))}
              </p>
            )}
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <span>Ready, waiting for the customer</span>
                <span className="font-semibold tabular-nums">{ops.ready_to_collect}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ops.uncollected_aging.map((a) => (
                  <Badge key={a.days} variant={a.orders && a.days !== "0-2" ? "outline" : "secondary"} className="tabular-nums">
                    {a.days} days: {a.orders}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* money */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dot
                light={oldOwed > 0 || shortCashUps.length ? "bad" : owed > 0 ? "watch" : "good"}
                label={oldOwed > 0 ? "Old unpaid balances" : owed > 0 ? "Unpaid balances" : "Nothing owed"}
              />
              Money owed
            </CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/customers" />}>
                Customers
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="flex items-baseline justify-between">
              <span>
                Unpaid on orders ({d.receivables.customers} {d.receivables.customers === 1 ? "customer" : "customers"})
              </span>
              <span className="text-lg font-semibold tabular-nums">{formatMoney(d.receivables.total)}</span>
            </div>
            <dl className="grid grid-cols-4 gap-2 text-center">
              {d.receivables.aging.map((a) => (
                <div key={a.days} className="rounded-lg border px-2 py-1.5">
                  <dt className="text-xs text-muted-foreground">{a.days} days</dt>
                  <dd className="text-xs font-medium tabular-nums">{formatMoney(a.amount)}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-1.5">
              <span className="font-medium">Cash-ups today</span>
              {d.cash_ups_today.length ? (
                d.cash_ups_today.map((s) => {
                  const diff = toCents(s.difference ?? "0")
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <span>{s.opened_by_name}</span>
                      {diff === 0 ? (
                        <Badge variant="secondary">Matches</Badge>
                      ) : diff < 0 ? (
                        <Badge variant="destructive">Short {formatMoney(fromCents(-diff))}</Badge>
                      ) : (
                        <Badge variant="outline">Over {formatMoney(fromCents(diff))}</Badge>
                      )}
                    </div>
                  )
                })
              ) : (
                <span className="text-muted-foreground">No shift closed yet today.</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.last_7_days.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{dayName.format(new Date(`${day.date}T12:00:00Z`))}</TableCell>
                    <TableCell className="text-right tabular-nums">{day.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(day.sales)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(day.collected)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top items (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {d.top_items_30_days.length ? (
              <ol className="grid gap-2 text-sm">
                {d.top_items_30_days.map((item, i) => (
                  <li key={item.item_name} className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="text-muted-foreground tabular-nums">{i + 1}.</span> {item.item_name}
                      <span className="text-xs text-muted-foreground"> × {item.quantity}</span>
                    </span>
                    <span className="font-medium tabular-nums">{formatMoney(item.sales)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No orders in the last 30 days.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
