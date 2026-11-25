import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { PackageCheckIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { SelectField } from "@/components/select-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { MASTER } from "@/features/masters/types"
import { useMasters } from "@/features/masters/use-masters"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { fromCents, toCents } from "../lib/pricing"
import { collectOrders, getReadyOrders } from "../services/order.service"
import { PAID_NOW, type OrderListRow, type PaymentMethod } from "../types"

/** Ways to settle a balance when handing orders back. */
const COLLECT_METHODS = new Set<string>([...PAID_NOW, "on_account"])

const readyFormat = shopDateFormat({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

type CustomerGroup = { id: string; name: string; phone: string; orders: OrderListRow[] }

/** Collection: hand ready orders back to the customer and settle what they owe. */
export function CollectionPage() {
  const { can } = useAuth()
  const canCollect = can("collection.create")

  const [term, setTerm] = useState("")
  const [query, setQuery] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 300)
    return () => clearTimeout(timer)
  }, [term])

  const fetchReady = useCallback(() => getReadyOrders(query), [query])
  const ready = useRecords(fetchReady, [] as OrderListRow[])

  const methods = useMasters(MASTER.PAYMENT_METHOD)
  const methodOptions = methods.options.filter((o) => o.value && COLLECT_METHODS.has(o.value))

  const [selected, setSelected] = useState<string[]>([])
  const [method, setMethod] = useState<string | null>(null)
  const [collecting, setCollecting] = useState(false)

  const groups = useMemo(() => {
    const byCustomer = new Map<string, CustomerGroup>()
    for (const o of ready.data) {
      const group = byCustomer.get(o.customer) ?? { id: o.customer, name: o.customer_name, phone: o.customer_phone, orders: [] }
      group.orders.push(o)
      byCustomer.set(o.customer, group)
    }
    return [...byCustomer.values()]
  }, [ready.data])

  const chosen = ready.data.filter((o) => selected.includes(o.id))
  const customer = groups.find((g) => g.id === chosen[0]?.customer)
  const dueCents = chosen.reduce((sum, o) => sum + toCents(o.balance), 0)
  const pieces = chosen.reduce((sum, o) => sum + o.pieces, 0)

  // one customer at a time: ticking another customer's order starts a new selection
  function toggle(order: OrderListRow, on: boolean) {
    setSelected((prev) => {
      const sameCustomer = ready.data.filter((o) => prev.includes(o.id)).every((o) => o.customer === order.customer)
      if (!on) return prev.filter((id) => id !== order.id)
      return sameCustomer ? [...prev, order.id] : [order.id]
    })
  }

  async function collect() {
    if (collecting || !chosen.length) return
    if (dueCents > 0 && !method) {
      toast.error("Choose how the customer pays.")
      return
    }
    setCollecting(true)
    try {
      const paidNow = dueCents > 0 && method && PAID_NOW.includes(method as PaymentMethod)
      const collected = await collectOrders(
        chosen.map((o) => o.id),
        dueCents > 0 ? method! : "",
        paidNow ? fromCents(dueCents) : "0",
      )
      toast.success(`Collected ${collected.map((o) => o.number).join(", ")}`)
      setSelected([])
      setMethod(null)
      await ready.reload()
    } catch (err) {
      toast.error(Object.values(getApiFieldErrors(err))[0] ?? getApiErrorMessage(err, "Couldn't collect the orders."))
    } finally {
      setCollecting(false)
    }
  }

  return (
    <>
      <PageHeader title="Collection" description="Hand over ready orders and collect any balance due." />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative w-full sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Phone, name or order number…"
              aria-label="Find ready orders"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
            />
          </div>

          {ready.loading ? (
            <div className="flex h-40 items-center justify-center gap-2 rounded-lg border text-muted-foreground">
              <Spinner />
              Loading…
            </div>
          ) : ready.error ? (
            <p className="text-sm text-destructive">{getApiErrorMessage(ready.error)}</p>
          ) : groups.length ? (
            groups.map((group) => {
              const allChosen = group.orders.every((o) => selected.includes(o.id))
              return (
                <Card key={group.id} size="sm">
                  <CardHeader>
                    <CardTitle>{group.name}</CardTitle>
                    <span className="text-sm text-muted-foreground tabular-nums">{group.phone}</span>
                    {canCollect && group.orders.length > 1 && (
                      <CardAction>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelected(allChosen ? [] : group.orders.map((o) => o.id))}
                        >
                          {allChosen ? "Clear" : `Select all ${group.orders.length}`}
                        </Button>
                      </CardAction>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {group.orders.map((o) => (
                      <label
                        key={o.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5"
                      >
                        {canCollect && (
                          <Checkbox
                            checked={selected.includes(o.id)}
                            onCheckedChange={(on) => toggle(o, !!on)}
                            aria-label={`Collect ${o.number}`}
                          />
                        )}
                        <div className="grid min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <Link to={`/orders/${o.id}`} className="font-medium tabular-nums hover:underline">
                              {o.number}
                            </Link>
                            {o.rack && <Badge variant="outline">Rack {o.rack}</Badge>}
                            {o.deadstock && <Badge variant="destructive">Deadstock</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {o.pieces} {o.pieces === 1 ? "piece" : "pieces"} · ready {readyFormat.format(new Date(o.ready_by))}
                          </span>
                        </div>
                        <div className="text-right tabular-nums">
                          {Number(o.balance) > 0 ? (
                            <span className="font-medium">Due {formatMoney(o.balance)}</span>
                          ) : (
                            <Badge variant="secondary">Paid</Badge>
                          )}
                        </div>
                      </label>
                    ))}
                  </CardContent>
                </Card>
              )
            })
          ) : (
            <Empty className="rounded-lg border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageCheckIcon />
                </EmptyMedia>
                <EmptyTitle>{query ? "No ready orders found" : "Nothing ready to collect"}</EmptyTitle>
                <EmptyDescription>
                  {query
                    ? `No ready order matches “${query}”. It may still be in production.`
                    : "Orders show up here once they're marked Ready on the Production board."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        {/* the hand-over */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Hand over</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {chosen.length && customer ? (
              <>
                <div className="grid gap-0.5 text-sm">
                  <span className="font-medium">{customer.name}</span>
                  <span className="text-muted-foreground">
                    {chosen.length} {chosen.length === 1 ? "order" : "orders"} · {pieces} {pieces === 1 ? "piece" : "pieces"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm">Balance due</span>
                  <span className="text-lg font-semibold tabular-nums">{formatMoney(fromCents(dueCents))}</span>
                </div>
                {dueCents > 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="collect-method">Customer pays by</Label>
                    <SelectField
                      id="collect-method"
                      placeholder="Choose…"
                      value={method}
                      onValueChange={setMethod}
                      options={methodOptions}
                    />
                    {method === "on_account" && (
                      <p className="text-xs text-muted-foreground">The balance stays on the customer's account.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Tick the orders the customer is collecting.</p>
            )}
          </CardContent>
          {canCollect && (
            <CardFooter className="border-t">
              <Button
                size="lg"
                className="w-full"
                disabled={!chosen.length || collecting || (dueCents > 0 && !method)}
                onClick={() => void collect()}
              >
                {collecting && <Spinner data-icon="inline-start" />}
                {dueCents > 0 && method && method !== "on_account"
                  ? `Take ${formatMoney(fromCents(dueCents))} and hand over`
                  : "Hand over"}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </>
  )
}
