import { useCallback, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeftIcon, BanknoteIcon, CircleAlertIcon, PlusIcon, PrinterIcon, Undo2Icon, ZapIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { MoneyDialog } from "@/features/payments/components/money-dialog"
import { payOrder, refundOrder } from "@/features/payments/services/payments.service"
import { getCompanySettings } from "@/features/company/services/company.service"
import type { CompanySettings } from "@/features/company/types"
import { getOrder } from "../services/order.service"
import { STATUS_LABELS, type Order } from "../types"

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
  // the business's name, logo, contact details and terms for the receipt
  const company = useRecords(getCompanySettings, null as CompanySettings | null)
  const { can } = useAuth()
  const [paying, setPaying] = useState(false)
  const [refunding, setRefunding] = useState(false)

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
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/orders" />}>
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
          <Button variant="ghost" size="icon-sm" aria-label="Back to orders" nativeButton={false} render={<Link to="/orders" />}>
            <ArrowLeftIcon />
          </Button>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              Order {o.number}
              <Badge variant="outline">
                {o.status === "received" && o.stage_name ? o.stage_name : STATUS_LABELS[o.status]}
              </Badge>
              {o.rack && <Badge variant="secondary">Rack {o.rack}</Badge>}
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
        <div className="flex flex-wrap gap-2">
          {can("payments.create") && Number(o.balance) > 0 && o.status !== "cancelled" && (
            <Button variant="outline" onClick={() => setPaying(true)}>
              <BanknoteIcon data-icon="inline-start" />
              Take payment
            </Button>
          )}
          {can("payments.edit") && Number(o.paid_amount) > 0 && (
            <Button variant="outline" onClick={() => setRefunding(true)}>
              <Undo2Icon data-icon="inline-start" />
              Refund
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            Print receipt
          </Button>
          {can("orders.create") && (
            <Button nativeButton={false} render={<Link to="/orders/new" />}>
              <PlusIcon data-icon="inline-start" />
              New order
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Receipt order={o} company={company.data} />
        <div className="grid gap-4">
          <Timeline order={o} />
          {o.payments.length > 0 && <Payments order={o} />}
        </div>
      </div>

      <MoneyDialog
        open={paying}
        onOpenChange={setPaying}
        title={`Take payment for ${o.number}`}
        description={`Balance due: ${formatMoney(o.balance)}.`}
        maxAmount={o.balance}
        submitLabel={(amount) => `Take ${amount}`}
        onSubmit={async (amount, method) => {
          order.setData(await payOrder(o.id, amount, method))
          toast.success(`${formatMoney(amount)} received for ${o.number}`)
        }}
      />
      <MoneyDialog
        open={refunding}
        onOpenChange={setRefunding}
        title={`Refund on ${o.number}`}
        description={`Paid so far: ${formatMoney(o.paid_amount)}. The refund is recorded in your shift.`}
        maxAmount={o.paid_amount}
        withReason
        submitLabel={(amount) => `Refund ${amount}`}
        onSubmit={async (amount, method, reason) => {
          order.setData(await refundOrder(o.id, amount, method, reason))
          toast.success(`${formatMoney(amount)} refunded on ${o.number}`)
        }}
      />
    </div>
  )
}

/** Money taken and given back on this order. */
function Payments({ order: o }: { order: Order }) {
  return (
    <section className="rounded-lg border bg-card p-4 text-sm print:hidden" aria-label="Payments">
      <h3 className="mb-3 font-medium">Payments</h3>
      <ul className="grid gap-2.5">
        {o.payments.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3">
            <div className="grid">
              <span>
                {p.kind === "refund" ? "Refund" : "Payment"} · {p.method_name}
              </span>
              {p.reason && <span className="text-xs">{p.reason}</span>}
              <span className="text-xs text-muted-foreground">
                {longDate.format(new Date(p.created_at))} · {p.received_by_name}
              </span>
            </div>
            <span className={`font-medium tabular-nums ${p.kind === "refund" ? "text-destructive" : ""}`}>
              {p.kind === "refund" ? "− " : ""}
              {formatMoney(p.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Sized like an 80 mm thermal receipt; the only thing printed (see .print-area in index.css). */
function Receipt({ order: o, company }: { order: Order; company: CompanySettings | null }) {
  const paid = Number(o.paid_amount)
  // how the money was actually paid (from the payments), e.g. "Cash, Card"
  const paidWith = [...new Set(o.payments.filter((p) => p.kind === "payment").map((p) => p.method_name))].join(", ")
  const balance = Number(o.balance)
  return (
    <div className="print-area mx-auto w-full max-w-sm rounded-lg border bg-card p-5 text-sm text-card-foreground">
      <div className="grid gap-1 text-center">
        {company?.logo && <img src={company.logo} alt="" className="mx-auto max-h-16 max-w-[60%] object-contain" />}
        <div className="text-base font-semibold">{company?.name || o.branch_name}</div>
        {company?.name && <div className="text-xs">{o.branch_name}</div>}
        {company?.address && <div className="text-xs whitespace-pre-line text-muted-foreground">{company.address}</div>}
        {(company?.phone || company?.email) && (
          <div className="text-xs text-muted-foreground">{[company.phone, company.email].filter(Boolean).join(" · ")}</div>
        )}
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
        {paid > 0 && <ReceiptRow label={paidWith ? `Paid (${paidWith})` : "Paid"} value={formatMoney(o.paid_amount)} />}
        <ReceiptRow
          label={balance > 0 ? "Balance due" : "Paid in full"}
          value={balance > 0 ? formatMoney(o.balance) : "✓"}
          strong
        />
        {paid === 0 && (
          <div className="text-xs text-muted-foreground">{o.payment_method_name}</div>
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
      {company?.receipt_footer && (
        <div className="mt-2 text-center text-[11px] leading-snug whitespace-pre-line text-muted-foreground">
          {company.receipt_footer}
        </div>
      )}
    </div>
  )
}

/** Every step of the order: taken, each production stage, ready, collected; who and when. */
function Timeline({ order: o }: { order: Order }) {
  return (
    <section className="rounded-lg border bg-card p-4 text-sm print:hidden" aria-label="Order timeline">
      <h3 className="mb-3 font-medium">Timeline</h3>
      <ol className="grid gap-3">
        {o.history.map((step, i) => (
          <li key={i} className="relative grid gap-0.5 border-l pl-4">
            <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-primary" aria-hidden />
            <span className="font-medium">
              {i === 0
                ? "Order taken"
                : step.status === "received" && step.stage_name
                  ? step.stage_name
                  : step.status === "received"
                    ? "Back to Received"
                    : STATUS_LABELS[step.status]}
            </span>
            {step.note && <span className="text-xs">{step.note}</span>}
            <span className="text-xs text-muted-foreground">
              {longDate.format(new Date(step.changed_at))} · {step.changed_by_name}
            </span>
          </li>
        ))}
      </ol>
    </section>
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
