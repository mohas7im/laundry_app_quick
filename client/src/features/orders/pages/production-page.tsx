import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import { ArrowRightIcon, CircleAlertIcon, RefreshCwIcon, ScanLineIcon, SearchIcon, ZapIcon } from "lucide-react"
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
import { shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getProductionBoard, moveOrders } from "../services/order.service"
import type { OrderListRow, ProductionBoard } from "../types"

const RECEIVED = "received"
const READY = "ready"
const REFRESH_MS = 30_000

const dueFormat = shopDateFormat({ weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

type Column = { key: string; name: string }

/** Production: the workshop board, Received → stages → Ready (stages from Common Masters). */
export function ProductionPage() {
  const board = useRecords(getProductionBoard, null as ProductionBoard | null)
  const { can } = useAuth()
  const canMove = can("production.edit")

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [target, setTarget] = useState<string | null>(null)
  const [rack, setRack] = useState("")
  const [scan, setScan] = useState("")
  const [filter, setFilter] = useState("")
  const [now, setNow] = useState(() => Date.now())
  // orders being moved right now: the same order can't be sent twice, but scans of
  // different orders run side by side (a scanner fires them quickly; none may be lost)
  const busy = useRef(new Set<string>())
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())

  // other counters move orders too: refresh the board (and the late colouring) every 30 s
  const { reload } = board
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
      reload()
    }, REFRESH_MS)
    return () => clearInterval(timer)
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
    const all = board.data?.orders ?? []
    return term
      ? all.filter((o) => `${o.number} ${o.customer_name} ${o.customer_phone}`.toLowerCase().includes(term))
      : all
  }, [board.data, filter])

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

  return (
    <>
      <PageHeader
        title="Production"
        description="Orders in the workshop, late ones first. Move them along until they're ready."
        actions={
          <Button variant="outline" size="icon" aria-label="Refresh the board" onClick={() => void reload()}>
            <RefreshCwIcon />
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {canMove && (
          <form onSubmit={submitScan} className="relative w-full sm:max-w-xs">
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
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filter by order, name or phone…"
            aria-label="Filter the board"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
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
    </>
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
      <div className="truncate">{order.customer_name}</div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {order.pieces} {order.pieces === 1 ? "piece" : "pieces"}
        </span>
        <span className={late ? "font-medium text-destructive" : undefined}>
          {late ? "Late · " : order.status === READY ? "" : "Due "}
          {dueFormat.format(due)}
        </span>
      </div>
      {order.rack && (
        <Badge variant="outline" className="w-fit">
          Rack {order.rack}
        </Badge>
      )}
    </div>
  )
}
