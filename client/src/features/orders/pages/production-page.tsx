import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import {
  ArrowRightIcon,
  CircleAlertIcon,
  PrinterIcon,
  RefreshCwIcon,
  ScanLineIcon,
  SearchIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { SelectField } from "@/components/select-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { lineText, shopDay, shopDayFromToday } from "../lib/summary"
import { getProductionBoard, moveOrders } from "../services/order.service"
import type { OrderListRow, ProductionBoard } from "../types"

const RECEIVED = "received"
const READY = "ready"
/** Other counters move orders too: refresh this often, and whenever the tab comes back into view. */
const REFRESH_MS = 15_000

const dueFormat = shopDateFormat({ weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const printedFormat = shopDateFormat({ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })

type Column = { key: string; name: string }
type Due = "all" | "late" | "today" | "tomorrow" | "deadstock"
type Kind = "all" | "express" | "normal"

const DUE_OPTIONS: { value: Due; label: string }[] = [
  { value: "all", label: "Any date" },
  { value: "late", label: "Late" },
  { value: "today", label: "Due today" },
  { value: "tomorrow", label: "Due tomorrow" },
  { value: "deadstock", label: "Deadstock" },
]
const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "all", label: "Express and normal" },
  { value: "express", label: "Express only" },
  { value: "normal", label: "Normal only" },
]

/** Production: the workshop board, Received → stages → Ready (stages from Common Masters). */
export function ProductionPage() {
  const board = useRecords(getProductionBoard, null as ProductionBoard | null)
  const { can, activeBranch } = useAuth()
  const canMove = can("production.edit")

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [target, setTarget] = useState<string | null>(null)
  const [rack, setRack] = useState("")
  const [scan, setScan] = useState("")
  const [filter, setFilter] = useState("")
  const [section, setSection] = useState("all")
  const [kind, setKind] = useState<Kind>("all")
  const [due, setDue] = useState<Due>("all")
  const [now, setNow] = useState(() => Date.now())
  // orders being moved right now: the same order can't be sent twice, but scans of
  // different orders run side by side (a scanner fires them quickly; none may be lost)
  const busy = useRef(new Set<string>())
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())

  const { reload } = board
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now())
      void reload()
    }
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS)
    const onVisible = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [reload])

  const columns: Column[] = useMemo(
    () => [
      { key: RECEIVED, name: "Received" },
      ...(board.data?.stages ?? []).map((s) => ({ key: s.code, name: s.name })),
      { key: READY, name: "Ready" },
    ],
    [board.data],
  )
  const columnKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns])
  const columnOf = (o: OrderListRow) =>
    o.status === READY ? READY : o.stage && columnKeys.has(o.stage) ? o.stage : RECEIVED

  const orders = useMemo(() => {
    const term = filter.trim().toLowerCase()
    const today = shopDayFromToday(0)
    const tomorrow = shopDayFromToday(1)
    return (board.data?.orders ?? []).filter((o) => {
      if (term && !`${o.number} ${o.customer_name} ${o.customer_phone}`.toLowerCase().includes(term)) return false
      if (section !== "all" && !o.summary.some((l) => l.service === section)) return false
      if (kind !== "all" && o.is_express !== (kind === "express")) return false
      if (due === "late") return o.status !== READY && new Date(o.ready_by).getTime() < now
      if (due === "today") return shopDay(o.ready_by) === today
      if (due === "tomorrow") return shopDay(o.ready_by) === tomorrow
      if (due === "deadstock") return o.deadstock
      return true
    })
  }, [board.data, filter, section, kind, due, now])

  // the totals follow the filters
  const totals = useMemo(
    () => ({
      orders: orders.length,
      pieces: orders.reduce((n, o) => n + o.pieces, 0),
      value: orders.reduce((n, o) => n + Number(o.total), 0),
      unpaid: orders.reduce((n, o) => n + Math.max(Number(o.balance), 0), 0),
    }),
    [orders],
  )
  const filtered = !!filter.trim() || section !== "all" || kind !== "all" || due !== "all"

  async function move(ids: string[], to: string, { rack: rackValue = "", bulk = false } = {}) {
    const free = ids.filter((id) => !busy.current.has(id))
    if (!free.length) return
    for (const id of free) busy.current.add(id)
    setBusyIds(new Set(busy.current))
    try {
      const moved = await moveOrders(free, to, rackValue)
      toast.success(moved.length === 1 ? `${moved[0]!.number} moved` : `${moved.length} orders moved`)
      if (bulk) {
        setSelected(new Set())
        setRack("")
      }
      await reload()
    } catch (err) {
      toast.error(Object.values(getApiFieldErrors(err))[0] ?? getApiErrorMessage(err, "Couldn't move the orders."))
    } finally {
      for (const id of free) busy.current.delete(id)
      setBusyIds(new Set(busy.current))
    }
  }

  // a scanner types the order number and Enter: the order goes to its next column
  function submitScan(e: React.FormEvent) {
    e.preventDefault()
    const number = scan.trim().toUpperCase()
    if (!number) return
    const order = board.data?.orders.find((o) => o.number.toUpperCase() === number)
    setScan("")
    if (!order) toast.error(`${number} isn't on the board (not found, collected, or another branch).`)
    else if (order.status === READY) toast.info(`${order.number} is already ready.`)
    else void move([order.id], "next")
  }

  const selectionBusy = [...selected].some((id) => busyIds.has(id))

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  if (board.loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    )
  }
  if (board.error || !board.data) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Couldn't load the board</EmptyTitle>
          <EmptyDescription>{getApiErrorMessage(board.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={board.retry}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  // the to-clean list: what is still in the workshop, in the board's filters, soonest first
  const toClean = orders.filter((o) => o.status !== READY)

  return (
    <>
      <PageHeader
        title="Production"
        description="Orders in the workshop, late ones first. Move them along until they're ready."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" disabled={!toClean.length} onClick={() => window.print()}>
              <PrinterIcon data-icon="inline-start" />
              Print list
            </Button>
            <Button variant="outline" size="icon" aria-label="Refresh the board" onClick={() => void reload()}>
              <RefreshCwIcon />
            </Button>
          </div>
        }
      />

      {/* totals of what the filters show */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Orders" value={String(totals.orders)} />
        <Stat label="Pieces" value={String(totals.pieces)} />
        <Stat label="Value" value={formatMoney(totals.value)} />
        <Stat label="Unpaid" value={formatMoney(totals.unpaid)} tone={totals.unpaid > 0 ? "warn" : undefined} />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {canMove && (
          <form onSubmit={submitScan} className="relative w-full sm:w-64">
            <ScanLineIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Scan or type an order number…"
              aria-label="Scan an order to move it to its next step"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
            />
          </form>
        )}
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filter by order, name or phone…"
            aria-label="Filter the board"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <SelectField
          aria-label="Section"
          className="w-full sm:w-44"
          value={section}
          onValueChange={(v) => setSection(v ?? "all")}
          options={[
            { value: "all", label: "All sections" },
            ...board.data.services.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <SelectField
          aria-label="Order type"
          className="w-full sm:w-44"
          value={kind}
          onValueChange={(v) => setKind((v ?? "all") as Kind)}
          options={KIND_OPTIONS}
        />
        <SelectField
          aria-label="Due"
          className="w-full sm:w-40"
          value={due}
          onValueChange={(v) => setDue((v ?? "all") as Due)}
          options={DUE_OPTIONS}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilter("")
              setSection("all")
              setKind("all")
              setDue("all")
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {canMove && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          <SelectField
            aria-label="Move to"
            className="w-44"
            placeholder="Move to…"
            value={target}
            onValueChange={setTarget}
            options={columns.map((c) => ({ value: c.key, label: c.name }))}
          />
          {target === READY && (
            <Input
              className="w-28"
              placeholder="Rack"
              aria-label="Rack (optional)"
              value={rack}
              onChange={(e) => setRack(e.target.value)}
            />
          )}
          <Button
            disabled={!target || selectionBusy}
            onClick={() => target && void move([...selected], target, { rack, bulk: true })}
          >
            {selectionBusy && <Spinner data-icon="inline-start" />}
            Move
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="flex min-w-0 gap-3 overflow-x-auto pb-2">
        {columns.map((column, index) => {
          const inColumn = orders.filter((o) => columnOf(o) === column.key)
          const next = columns[index + 1]
          return (
            <section key={column.key} className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2">
              <h3 className="flex items-center justify-between px-1 text-sm font-medium">
                {column.name}
                <Badge variant="secondary" className="tabular-nums">
                  {inColumn.length}
                </Badge>
              </h3>
              {inColumn.length ? (
                inColumn.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    now={now}
                    canMove={canMove}
                    selected={selected.has(order.id)}
                    onToggle={(on) => toggle(order.id, on)}
                    nextName={next?.name}
                    onNext={() => void move([order.id], "next")}
                    disabled={busyIds.has(order.id)}
                  />
                ))
              ) : (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
              )}
            </section>
          )
        })}
      </div>

      {/* printed on A4 by "Print list" (see .print-page in index.css); hidden on screen */}
      <article className="print-page hidden text-xs print:block">
        <header className="mb-3 flex items-end justify-between border-b pb-2">
          <div>
            <h1 className="text-base font-semibold">To clean · {activeBranch?.name}</h1>
            <p>
              {toClean.length} orders · {toClean.reduce((n, o) => n + o.pieces, 0)} pieces
              {filtered ? " · filtered" : ""}
            </p>
          </div>
          <p>Printed {printedFormat.format(new Date())}</p>
        </header>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Order</th>
              <th className="py-1 pr-2">Ready by</th>
              <th className="py-1 pr-2">Customer</th>
              <th className="py-1 pr-2">Items</th>
              <th className="py-1 pr-2 text-right">Pcs</th>
              <th className="py-1 pr-2">Notes</th>
              <th className="py-1 text-center">Done</th>
            </tr>
          </thead>
          <tbody>
            {toClean.map((o) => (
              <tr key={o.id} className="break-inside-avoid border-b align-top">
                <td className="py-1 pr-2 font-medium tabular-nums">
                  {o.number}
                  {o.is_express && " ⚡"}
                </td>
                <td className="py-1 pr-2">{dueFormat.format(new Date(o.ready_by))}</td>
                <td className="py-1 pr-2">{o.customer_name}</td>
                <td className="py-1 pr-2">
                  {o.summary.map((l, i) => (
                    <div key={i}>{lineText(l)}</div>
                  ))}
                  {o.summary.length === 0 && o.pieces > 0 && <div>Bag drop</div>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{o.pieces}</td>
                <td className="py-1 pr-2">{[o.preferences, o.notes].filter(Boolean).join(" · ")}</td>
                <td className="py-1 text-center">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  )
}

function OrderCard({
  order,
  now,
  canMove,
  selected,
  onToggle,
  nextName,
  onNext,
  disabled,
}: {
  order: OrderListRow
  now: number
  canMove: boolean
  selected: boolean
  onToggle: (on: boolean) => void
  nextName?: string
  onNext: () => void
  disabled: boolean
}) {
  const due = new Date(order.ready_by)
  const late = order.status !== READY && due.getTime() < now
  const shown = order.summary.slice(0, 3)
  const notes = [order.preferences, order.notes].filter(Boolean).join(" · ")
  return (
    <div
      data-selected={selected || undefined}
      className="grid gap-1.5 rounded-lg border bg-card p-3 text-sm shadow-xs data-selected:border-primary data-selected:ring-1 data-selected:ring-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {canMove && (
            <Checkbox checked={selected} onCheckedChange={(on) => onToggle(!!on)} aria-label={`Select ${order.number}`} />
          )}
          <Link to={`/orders/${order.id}`} className="font-medium tabular-nums hover:underline">
            {order.number}
          </Link>
          {order.is_express && (
            <Badge className="gap-0.5 px-1.5">
              <ZapIcon className="size-3" />
              Express
            </Badge>
          )}
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Print the receipt of ${order.number}`}
            title="Print receipt"
            nativeButton={false}
            render={<Link to={`/orders/${order.id}?print=1`} />}
          >
            <PrinterIcon />
          </Button>
          {canMove && nextName && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${order.number} to ${nextName}`}
              title={`Move to ${nextName}`}
              disabled={disabled}
              onClick={onNext}
            >
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </div>
      <div className="truncate">{order.customer_name}</div>
      {shown.length > 0 && (
        <ul className="grid text-xs">
          {shown.map((l, i) => (
            <li key={i} className="truncate">
              {lineText(l)}
            </li>
          ))}
          {order.summary.length > shown.length && (
            <li className="text-muted-foreground">+{order.summary.length - shown.length} more</li>
          )}
        </ul>
      )}
      {notes && <p className="line-clamp-2 text-xs text-muted-foreground">{notes}</p>}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {order.pieces} {order.pieces === 1 ? "piece" : "pieces"}
          {Number(order.balance) > 0 && ` · ${formatMoney(order.balance)} due`}
        </span>
        <span className={late ? "font-medium text-destructive" : undefined}>
          {late ? "Late · " : order.status === READY ? "" : "Due "}
          {dueFormat.format(due)}
        </span>
      </div>
      {(order.rack || order.deadstock) && (
        <div className="flex flex-wrap gap-1">
          {order.rack && <Badge variant="outline">Rack {order.rack}</Badge>}
          {order.deadstock && <Badge variant="destructive">Deadstock</Badge>}
        </div>
      )}
    </div>
  )
}
