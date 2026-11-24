import { useCallback, useEffect, useRef, useState } from "react"
import JsBarcode from "jsbarcode"
import { Link, useParams, useSearchParams } from "react-router"
import {
  ArrowLeftIcon,
  BanknoteIcon,
  BanIcon,
  CircleAlertIcon,
  CopyIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Undo2Icon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { CancelOrderDialog } from "../components/cancel-order-dialog"
import { pieceSummary, isEmptyPiece } from "../components/piece-notes-dialog"
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
  const [cancelling, setCancelling] = useState(false)

  // /orders/:id?print=1 (the print buttons on the board and the order list): print the
  // receipt as soon as it and the company details are on the page, once
  const [params, setParams] = useSearchParams()
  const autoPrint = params.get("print") === "1" && !!order.data && !company.loading
  useEffect(() => {
    if (!autoPrint) return
    setParams({}, { replace: true })
    const timer = setTimeout(() => window.print(), 300) // let the logo render first
    return () => clearTimeout(timer)
  }, [autoPrint, setParams])

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
  const open = o.status === "received" || o.status === "ready"

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
          {can("orders.edit") && open && (
            <Button variant="outline" nativeButton={false} render={<Link to={`/orders/${o.id}/edit`} />}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          )}
          {can("orders.create") && (
            <Button nativeButton={false} render={<Link to="/orders/new" />}>
              <PlusIcon data-icon="inline-start" />
              New order
            </Button>
          )}
          {(can("orders.create") || (can("orders.delete") && open)) && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {can("orders.create") && (
                  <DropdownMenuItem render={<Link to={`/orders/new?copy=${o.id}`} />}>
                    <CopyIcon />
                    Copy into a new order
                  </DropdownMenuItem>
                )}
                {can("orders.delete") && open && (
                  <DropdownMenuItem variant="destructive" onClick={() => setCancelling(true)}>
                    <BanIcon />
                    Cancel order
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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

      <CancelOrderDialog
        order={o}
        open={cancelling}
        onOpenChange={setCancelling}
        onCancelled={(cancelled) => {
          order.setData(cancelled)
          toast.success(`Order ${cancelled.number} cancelled`)
        }}
      />
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

/** Barcode of the order number (Code 128), so the counter can scan the receipt. */
function OrderBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { format: "CODE128", width: 1.6, height: 42, displayValue: false, margin: 0 })
  }, [value])
  return <svg ref={ref} className="mx-auto h-[42px] max-w-full" aria-label={`Barcode ${value}`} />
}

const pad2 = (n: number) => String(n).padStart(2, "0")
/** 24/11/26 19:06 */
const dropDate = (iso: string) => {
  const d = new Date(iso)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
/** 6pm Thu 26/11 */
const readyDate = (iso: string) => {
  const d = new Date(iso)
  const h = d.getHours(), m = d.getMinutes()
  const hour = `${h % 12 || 12}${m ? ":" + pad2(m) : ""}${h < 12 ? "am" : "pm"}`
  return `${hour} ${d.toLocaleDateString("en-GB", { weekday: "short" })} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
}

/** Sized like an 80 mm thermal receipt; the only thing printed (see .print-area in index.css). Layout follows the
 *  CleanCloud receipt the staff already know. */
function Receipt({ order: o, company }: { order: Order; company: CompanySettings | null }) {
  const paid = Number(o.paid_amount)
  const paidWith = [...new Set(o.payments.filter((p) => p.kind === "payment").map((p) => p.method_name))].join(", ")
  const balance = Number(o.balance)
  const net = (Number(o.total) - Number(o.vat_amount)).toFixed(2)
  const lines = (company?.address || "").split("\n")
  const trnLine = lines.find((l) => /^TRN/i.test(l.trim()))
  const address = lines.filter((l) => l !== trnLine).join(", ")
  const Rule = () => <div className="my-2 border-t border-dashed" />
  return (
    <div className="print-area mx-auto w-full max-w-sm rounded-lg border bg-card p-5 text-sm text-card-foreground">
      <div className="grid gap-0.5 text-center">
        {company?.logo && <img src={company.logo} alt="" className="mx-auto mb-1 max-h-16 max-w-[60%] object-contain" />}
        <div className="text-base font-semibold">{company?.name || o.branch_name}</div>
        {address && <div className="text-xs">{address}</div>}
        {company?.phone && <div className="text-xs">Tel. {company.phone}</div>}
        {trnLine && <div className="text-xs">{trnLine.trim()}</div>}
        <div className="mx-auto mt-1.5 rounded-sm border-2 border-black px-4 py-0.5 text-base font-extrabold tracking-[0.2em]">
          TAX INVOICE
        </div>
      </div>
      <Rule />
      <div className="grid gap-1 text-center">
        <div className="text-2xl font-bold tracking-wide tabular-nums">INV# {o.number}</div>
        <OrderBarcode value={o.number} />
        {o.is_express && <div className="text-xs font-bold uppercase">Express</div>}
      </div>
      <Rule />
      <div className="grid gap-0.5 text-center text-xs">
        <div>Drop Date: {dropDate(o.created_at)}</div>
        <div>Served by: {o.created_by_name}</div>
        <div className="text-sm font-bold">Ready By: {readyDate(o.ready_by)}</div>
      </div>
      <Rule />
      <div className="grid gap-0.5 text-xs">
        <ReceiptRow label="Customer Name" value={o.customer_name} strong />
        <ReceiptRow label="Phone" value={o.customer_phone} />
        {o.customer_address && <ReceiptRow label="Address" value={o.customer_address.replace(/\n/g, ", ")} />}
      </div>
      <Rule />

      <div className="grid grid-cols-[1fr_1.5rem_1.6rem_3.1rem_3.4rem] gap-x-1 text-[11px] font-semibold">
        <span>Items</span><span className="text-center">Svc</span><span className="text-right">Qty</span>
        <span className="text-right leading-tight">Unit Price</span><span className="text-right">Price</span>
      </div>
      <div className="mt-1 border-t border-dashed pt-1 grid gap-1">
        {o.lines.map((line) => (
          <div key={line.id} className="grid">
            <div className="grid grid-cols-[1fr_1.5rem_1.6rem_3.1rem_3.4rem] gap-x-1 text-xs tabular-nums">
              <span className="font-medium">{line.item_name}</span>
              <span className="text-center">{line.service_name.charAt(0).toUpperCase()}</span>
              <span className="text-right">{line.quantity}{UNIT_SUFFIX[line.pricing_type] ? UNIT_SUFFIX[line.pricing_type].trim() : ""}</span>
              <span className="text-right">{Number(line.unit_price).toFixed(2)}</span>
              <span className="text-right">{Number(line.line_total).toFixed(2)}</span>
            </div>
            {line.upcharges.map((u) => (
              <span key={u.name} className="flex justify-between pl-2 text-[11px]">
                <span>+ {u.name}</span>
                <span className="tabular-nums">{Number(u.amount).toFixed(2)}</span>
              </span>
            ))}
            {line.pieces.map((p, i) =>
              isEmptyPiece(p) ? null : (
                <span key={i} className="pl-2 text-[11px]">#{i + 1} {pieceSummary(p)}</span>
              ),
            )}
          </div>
        ))}
        {o.bag_drop_pieces > 0 && (
          <div className="flex justify-between text-xs">
            <span>Bag drop: {o.bag_drop_pieces} pieces</span>
            <span>items to be added</span>
          </div>
        )}
      </div>
      <Rule />

      <div className="grid gap-0.5 tabular-nums">
        {Number(o.discount_amount) > 0 && (
          <>
            <ReceiptRow label="Items total" value={Number(o.subtotal).toFixed(2)} />
            <ReceiptRow
              label={o.discount_type === "percent" ? `Discount ${Number(o.discount_value)}%` : "Discount"}
              value={`- ${Number(o.discount_amount).toFixed(2)}`}
            />
          </>
        )}
        <ReceiptRow label="Sub Total" value={net} />
        <ReceiptRow label="VAT 5%" value={Number(o.vat_amount).toFixed(2)} />
        <ReceiptRow label="Total (AED)" value={Number(o.total).toFixed(2)} strong large />
        <ReceiptRow label="Total Pieces" value={String(o.pieces)} />
        {paid > 0 && <ReceiptRow label={paidWith ? `Paid (${paidWith})` : "Paid"} value={Number(o.paid_amount).toFixed(2)} />}
        <ReceiptRow label={balance > 0 ? "Balance due" : "Paid in full"} value={balance > 0 ? Number(o.balance).toFixed(2) : "✓"} strong />
        {paid === 0 && <div className="text-xs">{o.payment_method_name}</div>}
      </div>

      {(o.notes || o.preferences) && (
        <>
          <Rule />
          <div className="grid gap-0.5 text-xs">
            <div className="font-semibold">Notes</div>
            {o.preferences && <div>{o.preferences}</div>}
            {o.notes && <div className="whitespace-pre-line">{o.notes}</div>}
          </div>
        </>
      )}

      <Rule />
      <div className="text-[11px] leading-snug">
        <div>* VAT standard rate.</div>
        {company?.receipt_footer && <div className="whitespace-pre-line">{company.receipt_footer}</div>}
        <div className="mt-1 text-center">Please bring this receipt to collect.</div>
      </div>
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
                : step.note.startsWith("Edited:")
                  ? "Order edited"
                  : step.status === "received" && step.stage_name
                  ? step.stage_name
                  : step.status === "received"
                    ? "Back to Received"
                    : STATUS_LABELS[step.status]}
            </span>
            {step.note && <span className="text-xs">{step.note.replace(/^(Edited|Cancelled): /, "")}</span>}
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
