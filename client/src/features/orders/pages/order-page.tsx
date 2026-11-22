import { useCallback } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeftIcon, CircleAlertIcon, PlusIcon, PrinterIcon, ZapIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getOrder } from "../services/order.service"
import { PAYMENT_METHOD_LABELS, STATUS_LABELS, type Order } from "../types"

const UNIT_SUFFIX = { unit: "", per_kg: " kg", per_m2: " m²" } as const

const longDate = shopDateFormat({
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})

/** /orders/:id — the order with its receipt (Print prints only the receipt). */
export function OrderPage() {
  const { id = "" } = useParams()
  const fetchOrder = useCallback(() => getOrder(id), [id])
  const order = useRecords(fetchOrder, null as Order | null)
  const { can } = useAuth()

  if (order.loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    )
  }
  if (order.error || !order.data) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Couldn't load this order</EmptyTitle>
          <EmptyDescription>{getApiErrorMessage(order.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button variant="outline" size="sm" onClick={order.retry}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" render={<Link to="/orders" />}>
            Back to orders
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const o = order.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back to orders" render={<Link to="/orders" />}>
            <ArrowLeftIcon />
          </Button>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              Order {o.number}
              <Badge variant="outline">{STATUS_LABELS[o.status]}</Badge>
              {o.is_express && (
                <Badge>
                  <ZapIcon data-icon="inline-start" />
                  Express
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {o.customer_name} · ready by {longDate.format(new Date(o.ready_by))}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            Print receipt
          </Button>
          {can("orders.create") && (
            <Button render={<Link to="/orders/new" />}>
              <PlusIcon data-icon="inline-start" />
              New order
            </Button>
          )}
        </div>
      </div>

      <Receipt order={o} />
    </div>
  )
}

/** Sized like an 80 mm thermal receipt; the only thing printed (see .print-area in index.css). */
function Receipt({ order: o }: { order: Order }) {
  const paid = Number(o.paid_amount)
  const balance = Number(o.balance)
  return (
    <div className="print-area mx-auto w-full max-w-sm rounded-lg border bg-card p-5 text-sm text-card-foreground">
      <div className="text-center">
        <div className="text-base font-semibold">{o.branch_name}</div>
        <div className="text-xs text-muted-foreground">Prices include VAT</div>
      </div>

      <div className="my-3 border-t border-dashed" />
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Order</div>
        <div className="text-2xl font-bold tracking-wide tabular-nums">{o.number}</div>
        {o.is_express && <div className="text-xs font-semibold uppercase">Express</div>}
      </div>
      <div className="my-3 border-t border-dashed" />

      <ReceiptRow label="Customer" value={o.customer_name} />
      <ReceiptRow label="Phone" value={o.customer_phone} />
      <ReceiptRow label="Taken" value={longDate.format(new Date(o.created_at))} />
      <ReceiptRow label="Ready by" value={longDate.format(new Date(o.ready_by))} strong />
      <ReceiptRow label="Served by" value={o.created_by_name} />

      <div className="my-3 border-t border-dashed" />

      <div className="grid gap-2">
        {o.lines.map((line) => (
          <div key={line.id} className="grid">
            <div className="flex justify-between gap-2">
              <span>
                {line.quantity}
                {UNIT_SUFFIX[line.pricing_type] || " ×"} {line.item_name}
              </span>
              <span className="tabular-nums">{formatMoney(line.line_total)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {line.service_name} · {formatMoney(line.unit_price)}
              {UNIT_SUFFIX[line.pricing_type] ? ` /${UNIT_SUFFIX[line.pricing_type].trim()}` : " each"}
            </span>
            {line.upcharges.map((u) => (
              <span key={u.name} className="flex justify-between text-xs text-muted-foreground">
                <span>+ {u.name}</span>
                <span className="tabular-nums">{formatMoney(u.amount)}</span>
              </span>
            ))}
          </div>
        ))}
        {o.bag_drop_pieces > 0 && (
          <div className="flex justify-between">
            <span>Bag drop: {o.bag_drop_pieces} pieces</span>
            <span className="text-xs text-muted-foreground">items to be added</span>
          </div>
        )}
      </div>

      <div className="my-3 border-t border-dashed" />

      <div className="grid gap-1 tabular-nums">
        <ReceiptRow label="Subtotal" value={formatMoney(o.subtotal)} />
        {Number(o.discount_amount) > 0 && (
          <ReceiptRow
            label={o.discount_type === "percent" ? `Discount ${Number(o.discount_value)}%` : "Discount"}
            value={`− ${formatMoney(o.discount_amount)}`}
          />
        )}
        <ReceiptRow label="Total" value={formatMoney(o.total)} strong large />
        <ReceiptRow label="VAT included" value={formatMoney(o.vat_amount)} muted />
        {paid > 0 && <ReceiptRow label={`Paid (${PAYMENT_METHOD_LABELS[o.payment_method]})`} value={formatMoney(o.paid_amount)} />}
        <ReceiptRow
          label={balance > 0 ? "Balance due" : "Paid in full"}
          value={balance > 0 ? formatMoney(o.balance) : "✓"}
          strong
        />
        {paid === 0 && (
          <div className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[o.payment_method]}</div>
        )}
      </div>

      {o.notes && (
        <>
          <div className="my-3 border-t border-dashed" />
          <div className="text-xs">
            <span className="font-medium">Notes: </span>
            {o.notes}
          </div>
        </>
      )}

      <div className="my-3 border-t border-dashed" />
      <div className="text-center text-xs text-muted-foreground">
        {o.pieces} {o.pieces === 1 ? "piece" : "pieces"} · Please bring this receipt to collect.
      </div>
    </div>
  )
}

function ReceiptRow({
  label,
  value,
  strong,
  large,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  large?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={[
        "flex justify-between gap-3",
        strong ? "font-semibold" : "",
        large ? "text-base" : "",
        muted ? "text-muted-foreground" : "",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
