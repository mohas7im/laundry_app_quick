import { useCallback, useState } from "react"
import { Link } from "react-router"
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, RefreshCwIcon, TableIcon } from "lucide-react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toCents } from "@/features/orders/lib/pricing"
import { getApiErrorMessage } from "@/lib/api/errors"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getDashboard } from "../services/reports.service"
import type { AttentionList, Dashboard, SeriesRange } from "../types"

const dayName = shopDateFormat({
  weekday: "short",
  day: "numeric",
  month: "short",
})
const shortDay = shopDateFormat({ day: "numeric", month: "short" })
const dateTime = shopDateFormat({
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/** A shop day (YYYY-MM-DD) as a Date at noon UTC, so formatting in the shop's zone keeps the day. */
const asDay = (iso: string) => new Date(`${iso}T12:00:00Z`)

const RANGES: { value: SeriesRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
]

/** Sales and collected are one unit (AED) on one axis; the colours are a validated categorical pair. */
const SERIES = [
  { key: "sales", name: "Sales", color: "var(--series-1)" },
  { key: "collected", name: "Collected", color: "var(--series-2)" },
] as const

/** Colour follows the payment method, never its rank: cash is always slot 1. */
const METHOD_COLOR: Record<string, string> = {
  cash: "var(--series-1)",
  card: "var(--series-2)",
  bank: "var(--series-3)",
}
const methodColor = (code: string) => METHOD_COLOR[code] ?? "var(--series-4)"

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

/** Clean y-axis ticks from 0: steps of 1, 2, 2.5 or 5 × 10ⁿ, about four of them. */
function niceTicks(max: number) {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

/** Today vs yesterday: ↑ 12% / ↓ 5% / same. */
function Change({ today, yesterday }: { today: number; yesterday: number }) {
  if (!yesterday) return <span>Nothing yesterday</span>
  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  if (pct === 0) return <span>Same as yesterday</span>
  const Icon = pct > 0 ? ArrowUpIcon : ArrowDownIcon
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="size-3" aria-label={pct > 0 ? "Up" : "Down"} />
      {Math.abs(pct)}% vs yesterday
    </span>
  )
}

function Kpi({ title, value, children }: { title: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums group-data-[size=sm]/card:text-2xl">
          {value}
        </CardTitle>
      </CardHeader>
      {children && <CardContent className="grid gap-0.5 text-xs text-muted-foreground">{children}</CardContent>}
    </Card>
  )
}

/** The active branch at a glance (dashboard.view). */
export function BusinessDashboard() {
  const [range, setRange] = useState<SeriesRange>("7d")
  const fetcher = useCallback(() => getDashboard(range), [range])
  const dashboard = useRecords(fetcher, null as Dashboard | null)

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
  const onTime = d.on_time_30_days
  const oldOwed = d.receivables.aging.slice(2).reduce((sum, a) => sum + toCents(a.amount), 0) // 61+ days

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {d.branch_name} · {dayName.format(asDay(d.date))}
        </p>
        <Button variant="outline" size="sm" onClick={() => void dashboard.reload()}>
          <RefreshCwIcon data-icon="inline-start" />
          Refresh
        </Button>
      </div>

      {/* today */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Sales today" value={formatMoney(d.today.sales.sales)}>
          <Change today={toCents(d.today.sales.sales)} yesterday={toCents(d.yesterday.sales.sales)} />
          <span>{formatMoney(d.today.sales.sales_excl_vat)} excl. VAT</span>
        </Kpi>
        <Kpi title="Collected today" value={formatMoney(d.today.collected.net)}>
          <Change today={toCents(d.today.collected.net)} yesterday={toCents(d.yesterday.collected.net)} />
          {toCents(d.today.collected.refunded) > 0 && <span>{formatMoney(d.today.collected.refunded)} refunded</span>}
        </Kpi>
        <Kpi title="Orders today" value={d.today.sales.orders}>
          <span>
            {d.today.sales.pieces} pieces
            {d.today.sales.express_orders > 0 && ` · ${d.today.sales.express_orders} express`}
          </span>
          <span>
            {onTime.percent === null ? "On time (30 days): no data" : `${onTime.percent}% ready on time (30 days)`}
          </span>
        </Kpi>
        <Kpi title="Outstanding balance" value={formatMoney(d.receivables.total)}>
          <span>
            {d.receivables.customers} {d.receivables.customers === 1 ? "customer" : "customers"}
          </span>
          {oldOwed > 0 && <span>{formatMoney(oldOwed / 100)} older than 60 days</span>}
        </Kpi>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <SalesTrend data={d} range={range} onRange={setRange} className="lg:col-span-2" />
        <Workshop data={d} />
      </div>

      {/* what someone should act on */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <AttentionCard
          title="Overdue"
          empty="Nothing overdue."
          list={d.attention.overdue}
          detail={(o) => `Due ${dateTime.format(new Date(o.date))}`}
          link={{ to: "/production", label: "Production" }}
        />
        <AttentionCard
          title="Not collected (7+ days)"
          empty="No orders waiting more than a week."
          list={d.attention.not_collected}
          detail={(o) =>
            `Ready since ${shortDay.format(new Date(o.date))}${o.customer_phone ? ` · ${o.customer_phone}` : ""}`
          }
          link={{ to: "/collection", label: "Collection" }}
        />
        <AttentionCard
          title="Unpaid balances"
          empty="No unpaid balances."
          list={d.attention.unpaid}
          detail={(o) => `Taken ${shortDay.format(new Date(o.date))}`}
          amount
          link={{ to: "/orders", label: "Orders" }}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TopItems data={d} />
        <PaymentMethods data={d} />
      </div>
    </div>
  )
}

function SalesTrend({
  data,
  range,
  onRange,
  className,
}: {
  data: Dashboard
  range: SeriesRange
  onRange: (range: SeriesRange) => void
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const rows = data.series.map((day) => ({
    date: day.date,
    orders: day.orders,
    sales: Number(day.sales),
    collected: Number(day.collected),
  }))
  const last = rows.length - 1
  const totalSales = rows.reduce((sum, r) => sum + r.sales, 0)
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => Math.max(r.sales, r.collected))))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Sales and collections</CardTitle>
        <CardDescription>
          {formatMoney(totalSales)} sales in {RANGES.find((r) => r.value === range)?.label.toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* controls in their own row, so the title keeps its width on a phone */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <ul className="flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
                {s.name}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[range]}
              onValueChange={(v) => v[0] && onRange(v[0] as SeriesRange)}
              aria-label="Period"
            >
              {RANGES.map((r) => (
                <ToggleGroupItem key={r.value} value={r.value}>
                  {r.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              variant={asTable ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={asTable ? "Show chart" : "Show table"}
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
            >
              <TableIcon />
            </Button>
          </div>
        </div>
        {asTable ? (
          <div className="max-h-72 overflow-auto">
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
                {[...data.series].reverse().map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{dayName.format(asDay(day.date))}</TableCell>
                    <TableCell className="text-right tabular-nums">{day.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(day.sales)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(day.collected)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 72, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => shortDay.format(asDay(v))}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    width={44}
                    ticks={ticks}
                    domain={[0, ticks[ticks.length - 1]]}
                    tickFormatter={(v: number) => (v >= 10_000 ? compact.format(v) : v.toLocaleString("en"))}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{
                      stroke: "var(--muted-foreground)",
                      strokeWidth: 1,
                    }}
                    content={<TrendTooltip />}
                  />
                  {SERIES.map((s) => (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      name={s.name}
                      type="monotone"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: s.color,
                        stroke: "var(--card)",
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                      // direct label at the line's end, in text colour (the legend carries identity too)
                      label={({ index, x, y }: { index?: number; x?: number | string; y?: number | string }) =>
                        index === last ? (
                          <text
                            key={`${s.key}-end`}
                            x={Number(x) + 8}
                            y={Number(y)}
                            dy={4}
                            fontSize={12}
                            fill="var(--muted-foreground)"
                          >
                            {s.name}
                          </text>
                        ) : (
                          <g key={`${s.key}-${index}`} />
                        )
                      }
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

type TrendRow = {
  date: string
  orders: number
  sales: number
  collected: number
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendRow }[] }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="grid min-w-40 gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <span className="font-medium">{dayName.format(asDay(row.date))}</span>
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
          <span className="tabular-nums">{formatMoney(row[s.key])}</span>
        </span>
      ))}
      <span className="flex justify-between gap-3 text-muted-foreground">
        Orders <span className="text-popover-foreground tabular-nums">{row.orders}</span>
      </span>
    </div>
  )
}

/** One row per stage, in workshop order, one hue: how much work sits where. */
function Workshop({ data }: { data: Dashboard }) {
  const ops = data.operations
  const max = Math.max(1, ...ops.wip.map((w) => w.orders))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workshop</CardTitle>
        <CardDescription>Open orders by stage</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/production" />}>
            Production
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <ul className="grid gap-2.5">
          {ops.wip.map((w) => (
            <li key={w.code} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2">
              <span className="truncate text-muted-foreground">{w.name}</span>
              <span className="h-2.5 rounded-r bg-muted">
                {w.orders > 0 && (
                  <span
                    className="block h-full rounded-r"
                    style={{
                      width: `${(w.orders / max) * 100}%`,
                      background: "var(--series-1)",
                    }}
                  />
                )}
              </span>
              <span className="text-right font-medium tabular-nums">{w.orders}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t pt-3">
          <span>Overdue</span>
          <span className={`font-semibold tabular-nums ${ops.overdue ? "text-destructive" : ""}`}>
            {ops.overdue}
            {ops.overdue_express > 0 && ` (${ops.overdue_express} express)`}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function AttentionCard({
  title,
  empty,
  list,
  detail,
  amount,
  link,
}: {
  title: string
  empty: string
  list: AttentionList
  detail: (order: AttentionList["orders"][number]) => string
  amount?: boolean
  link: { to: string; label: string }
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {list.count > 0 && (
            <Badge variant={title === "Overdue" ? "destructive" : "secondary"} className="tabular-nums">
              {list.count}
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={link.to} />}>
            {link.label}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {list.orders.length ? (
          <ul className="-mx-2 grid">
            {list.orders.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="grid min-w-0">
                    <span className="truncate">
                      <span className="font-medium tabular-nums">{o.number}</span> · {o.customer_name}
                      {o.is_express && <span className="text-muted-foreground"> · Express</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{detail(o)}</span>
                  </span>
                  {amount && <span className="shrink-0 font-medium tabular-nums">{formatMoney(o.balance)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
        {list.count > list.orders.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the oldest {list.orders.length} of {list.count}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Ranked horizontal bars, one hue, value at the tip. */
function TopItems({ data }: { data: Dashboard }) {
  const items = data.top_items_30_days
  const max = Math.max(1, ...items.map((i) => Number(i.sales)))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top items</CardTitle>
        <CardDescription>By sales, last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="grid gap-3 text-sm">
            {items.map((item) => (
              <li key={item.item_name} className="grid gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    {item.item_name}
                    <span className="text-xs text-muted-foreground"> × {item.quantity}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(item.sales)}</span>
                </span>
                <span className="h-2 rounded-r bg-muted">
                  <span
                    className="block h-full rounded-r"
                    style={{
                      width: `${(Number(item.sales) / max) * 100}%`,
                      background: "var(--series-1)",
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No orders in the last 30 days.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Today's money by payment method: one thin split bar, the figures listed below it. */
function PaymentMethods({ data }: { data: Dashboard }) {
  const methods = data.today.collected.methods.filter((m) => toCents(m.net) > 0)
  const total = methods.reduce((sum, m) => sum + toCents(m.net), 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>Collected today</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/shifts" />}>
            Cash-up
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {methods.length ? (
          <>
            <div
              className="flex h-3 gap-0.5 overflow-hidden rounded"
              role="img"
              aria-label="Share of each payment method"
            >
              {methods.map((m) => (
                <span
                  key={m.method}
                  className="h-full first:rounded-l last:rounded-r"
                  style={{
                    flexGrow: toCents(m.net),
                    background: methodColor(m.method),
                  }}
                />
              ))}
            </div>
            <ul className="grid gap-2">
              {methods.map((m) => (
                <li key={m.method} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: methodColor(m.method) }} />
                    {m.method_name}
                    <span className="text-xs text-muted-foreground">
                      {m.count} {m.count === 1 ? "payment" : "payments"}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    <span className="font-medium">{formatMoney(m.net)}</span>
                    <span className="ml-2 inline-block w-9 text-right text-xs text-muted-foreground">
                      {percent(toCents(m.net), total)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground">Nothing collected yet today.</p>
        )}
      </CardContent>
    </Card>
  )
}
