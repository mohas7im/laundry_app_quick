import { useCallback, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import {
  CircleAlertIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import { SelectField } from "@/components/select-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { getCustomer } from "@/features/customers/services/customer.service"
import type { Customer } from "@/features/customers/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopNow } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { ApprovalPinDialog } from "../components/approval-pin-dialog"
import { CustomerPicker } from "../components/customer-picker"
import { PieceNotesDialog, isEmptyPiece, pieceSummary } from "../components/piece-notes-dialog"
import { fromCents, lineTotal, orderTotals, suggestedReadyBy, toCents } from "../lib/pricing"
import { createOrder, getOrder, getPosCatalogue, updateOrder } from "../services/order.service"
import {
  PAID_NOW,
  type DiscountType,
  type Order,
  type OrderLineRequest,
  type PaymentMethod,
  type PieceNote,
  type PosCatalogue,
} from "../types"

type CartLine = {
  key: string
  item: string
  service: string
  quantity: string
  upcharges: string[]
  pieces: PieceNote[]
}

/** Everything the screen starts with: empty, or from an order (copy or edit). */
type Draft = {
  customer: Customer | null
  express: boolean
  lines: CartLine[]
  bagPieces: string
  chips: string[]
  notes: string
  readyBy: string | null
  discountType: DiscountType
  discountValue: string
  discountReason: string
  /** Lines of the source order whose item or service is no longer sold. */
  dropped: number
}

type Loaded = { catalogue: PosCatalogue; source: Order | null; customer: Customer | null }

const UNIT_SUFFIX = { unit: "", per_kg: "kg", per_m2: "m²" } as const
/** The reason put on a discount that comes from the customer's own discount %. */
const CUSTOMER_DISCOUNT = "Customer discount"

const tileKey = (item: string, service: string) => `${item}:${service}`

/** /orders/new — a new order; /orders/new?copy=<id> starts from another order's items. */
export function NewOrderPage() {
  const [params] = useSearchParams()
  return <OrderScreen sourceId={params.get("copy")} mode="new" />
}

/** /orders/:id/edit — change an order that hasn't been collected. */
export function EditOrderPage() {
  const { id = "" } = useParams()
  return <OrderScreen sourceId={id} mode="edit" />
}

function OrderScreen({ sourceId, mode }: { sourceId: string | null; mode: "new" | "edit" }) {
  const load = useCallback(async (): Promise<Loaded> => {
    const [catalogue, source] = await Promise.all([getPosCatalogue(), sourceId ? getOrder(sourceId) : null])
    const customer = source ? await getCustomer(source.customer) : null
    return { catalogue, source, customer }
  }, [sourceId])
  const loaded = useRecords(load, null as Loaded | null)

  if (loaded.loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    )
  }
  if (loaded.error || !loaded.data) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{mode === "edit" ? "Can't edit this order" : "Can't take orders yet"}</EmptyTitle>
          <EmptyDescription>{getApiErrorMessage(loaded.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={loaded.retry}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const { catalogue, source, customer } = loaded.data
  const editing = mode === "edit" ? source : null
  if (editing && (editing.status === "collected" || editing.status === "cancelled")) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyTitle>Order {editing.number} is {editing.status}</EmptyTitle>
          <EmptyDescription>Only orders that haven't been collected can be changed.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/orders/${editing.id}`} />}>
            Back to the order
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return (
    <PosScreen
      key={`${mode}:${sourceId ?? ""}`}
      catalogue={catalogue}
      editing={editing}
      copiedFrom={mode === "new" ? source : null}
      initial={source ? draftFrom(source, customer, catalogue, mode === "edit") : emptyDraft}
    />
  )
}

const emptyDraft: Draft = {
  customer: null,
  express: false,
  lines: [],
  bagPieces: "",
  chips: [],
  notes: "",
  readyBy: null,
  discountType: "",
  discountValue: "",
  discountReason: "",
  dropped: 0,
}

/** "No starch. Gutra hanger" → the chips that match the quick notes, and the rest as text. */
function splitNotes(text: string, chipNames: string[]) {
  const parts = text.split(". ").map((p) => p.trim()).filter(Boolean)
  return {
    chips: parts.filter((p) => chipNames.includes(p)),
    notes: parts.filter((p) => !chipNames.includes(p)).join(". "),
  }
}

function draftFrom(order: Order, customer: Customer | null, catalogue: PosCatalogue, edit: boolean): Draft {
  const items = new Set(catalogue.items.map((i) => i.id))
  const services = new Set(catalogue.services.map((s) => s.id))
  const upcharges = new Set(catalogue.upcharges.map((u) => u.id))
  const kept = order.lines.filter((l) => items.has(l.item) && services.has(l.service))
  return {
    customer,
    express: order.is_express,
    lines: kept.map((l) => ({
      key: crypto.randomUUID(),
      item: l.item,
      service: l.service,
      quantity: l.quantity,
      upcharges: l.upcharges.map((u) => u.upcharge).filter((id) => upcharges.has(id)),
      pieces: l.pieces,
    })),
    bagPieces: order.bag_drop_pieces ? String(order.bag_drop_pieces) : "",
    ...splitNotes(order.notes, catalogue.order_notes.map((n) => n.name)),
    // edit: keep the promised time (shop time, for the input); copy: a new suggestion
    readyBy: edit ? shopNow(new Date(order.ready_by)).toISOString().slice(0, 16) : null,
    discountType: edit ? order.discount_type : "",
    discountValue: edit && order.discount_type ? String(Number(order.discount_value)) : "",
    discountReason: edit ? order.discount_reason : "",
    dropped: order.lines.length - kept.length,
  }
}

function PosScreen({
  catalogue,
  editing,
  copiedFrom,
  initial,
}: {
  catalogue: PosCatalogue
  /** The order being changed; null = a new order. */
  editing: Order | null
  copiedFrom: Order | null
  initial: Draft
}) {
  const navigate = useNavigate()
  const { can } = useAuth()

  const items = useMemo(() => new Map(catalogue.items.map((i) => [i.id, i])), [catalogue])
  const services = useMemo(() => new Map(catalogue.services.map((s) => [s.id, s])), [catalogue])
  const upcharges = useMemo(() => new Map(catalogue.upcharges.map((u) => [u.id, u])), [catalogue])
  // every price list's prices: "<list>:<item>:<service>"
  const priceIndex = useMemo(
    () => new Map(catalogue.prices.map((p) => [`${p.price_list}:${p.item}:${p.service}`, p])),
    [catalogue],
  )
  // most used first: lines per item and service at this branch
  const usage = useMemo(() => new Map(catalogue.usage.map((u) => [tileKey(u.item, u.service), u.count])), [catalogue])

  // lists from Common Masters
  const noteChips = catalogue.order_notes.map((n) => n.name)
  const paymentOptions = catalogue.payment_methods.map((m) => ({ value: m.code, label: m.name }))
  const discountOptions = [
    { value: "", label: "No discount" },
    ...catalogue.discount_types.map((d) => ({ value: d.code, label: d.name })),
  ]

  const [serviceId, setServiceId] = useState(catalogue.services[0]?.id ?? "")
  const [search, setSearch] = useState("")
  const [customer, setCustomer] = useState<Customer | null>(initial.customer)
  const [express, setExpress] = useState(initial.express)
  const [lines, setLines] = useState<CartLine[]>(initial.lines)
  const [bagDrop, setBagDrop] = useState(!!initial.bagPieces)
  const [bagPieces, setBagPieces] = useState(initial.bagPieces)
  const [chips, setChips] = useState<string[]>(initial.chips)
  const [notes, setNotes] = useState(initial.notes)
  const [saveNotes, setSaveNotes] = useState(false)
  const [readyBy, setReadyBy] = useState<string | null>(initial.readyBy) // null = the suggestion
  const [discountType, setDiscountType] = useState<DiscountType>(initial.discountType)
  const [discountValue, setDiscountValue] = useState(initial.discountValue)
  const [discountReason, setDiscountReason] = useState(initial.discountReason)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("on_collection")
  const [paidAmount, setPaidAmount] = useState("")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [approvalReason, setApprovalReason] = useState<string | null>(null)
  const [notesLine, setNotesLine] = useState<string | null>(null) // the line whose piece notes are open
  // the ready-by suggestion counts from when the screen opened
  const [openedAt] = useState(() => shopNow())

  // ── pricing (live; the server recalculates on submit) ──────────────────
  // the customer's own price list first, the default list for the rest
  const ownList = customer?.price_list ?? null
  const priceOf = useCallback(
    (item: string, service: string) =>
      (ownList ? priceIndex.get(`${ownList}:${item}:${service}`) : undefined) ??
      priceIndex.get(`${catalogue.price_list.id}:${item}:${service}`),
    [priceIndex, ownList, catalogue.price_list.id],
  )
  const unitPriceOf = useCallback(
    (item: string, service: string) => {
      const p = priceOf(item, service)
      if (!p) return null
      return express ? p.express_price : p.price
    },
    [priceOf, express],
  )

  const priced = lines.map((line) => {
    const p = priceOf(line.item, line.service)
    const unit = unitPriceOf(line.item, line.service)
    const total =
      unit === null || !p
        ? null
        : lineTotal({
            unitPrice: toCents(unit),
            quantity: Number(line.quantity) || 0,
            minPrice: p.min_price === null ? null : toCents(p.min_price),
            upcharges: line.upcharges.map((id) => upcharges.get(id)!).filter(Boolean),
          })
    return { line, unit, total }
  })
  const missingPrice = priced.filter((p) => p.total === null)
  const totals = orderTotals(
    priced.map((p) => p.total ?? 0),
    discountType,
    discountValue,
    catalogue.settings.vat_rate,
  )
  const paidCents = toCents(paidAmount)

  const extraDays = Math.max(0, ...lines.map((l) => priceOf(l.item, l.service)?.extra_days ?? 0))
  // shop time, e.g. "2026-11-24T18:00"
  const suggestion = suggestedReadyBy(openedAt, {
    express,
    extraDays,
    readyDays: catalogue.settings.ready_days,
    expressReadyDays: catalogue.settings.express_ready_days,
    readyTime: catalogue.settings.ready_time,
  })

  // a discount over the user's limit needs a manager (not the customer's own %, nor an unchanged one)
  const customerDiscount =
    discountType === "percent" && !!customer && Number(discountValue) > 0 &&
    Number(discountValue) <= Number(customer.discount_percent)
  const unchangedDiscount =
    !!editing && editing.discount_type === discountType && Number(editing.discount_value) === Number(discountValue)
  const discountPercent = totals.subtotal > 0 ? (totals.discount * 100) / totals.subtotal : 0
  const overLimit =
    catalogue.discount_limit !== null && totals.discount > 0 && !customerDiscount && !unchangedDiscount &&
    discountPercent > Number(catalogue.discount_limit) + 0.005

  // ── tiles: priced for this service, most used first ───────────────────
  const tiles = useMemo(() => {
    const term = search.trim().toLowerCase()
    return catalogue.items
      .filter((i) => priceOf(i.id, serviceId) && (!term || i.name.toLowerCase().includes(term)))
      .sort((a, b) => (usage.get(tileKey(b.id, serviceId)) ?? 0) - (usage.get(tileKey(a.id, serviceId)) ?? 0))
  }, [catalogue, priceOf, serviceId, search, usage])

  const pieceCount = (line: CartLine) =>
    items.get(line.item)?.pricing_type === "unit" ? Math.max(0, Math.floor(Number(line.quantity) || 0)) : 1

  const countInCart = (item: string) =>
    lines
      .filter((l) => l.item === item && l.service === serviceId)
      .reduce((n, l) => n + (items.get(l.item)?.pricing_type === "unit" ? Number(l.quantity) || 0 : 1), 0)

  function addItem(itemId: string) {
    setLines((prev) => {
      const existing = prev.find((l) => l.item === itemId && l.service === serviceId)
      if (existing) {
        if (items.get(itemId)?.pricing_type !== "unit") return prev // weighed items: edit the kg/m²
        return prev.map((l) => (l === existing ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l))
      }
      return [
        ...prev,
        { key: crypto.randomUUID(), item: itemId, service: serviceId, quantity: "1", upcharges: [], pieces: [] },
      ]
    })
  }

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))

  /** Picking a customer fills in their saved notes and their own discount. */
  function chooseCustomer(next: Customer | null) {
    setCustomer(next)
    setErrors(({ customer: _gone, ...rest }) => rest)
    if (next && !editing && !notes.trim() && !chips.length && next.notes) {
      const saved = splitNotes(next.notes, noteChips)
      setChips(saved.chips)
      setNotes(saved.notes)
    }
    const percent = Number(next?.discount_percent ?? 0)
    if (percent > 0 && (!discountType || discountReason === CUSTOMER_DISCOUNT)) {
      setDiscountType("percent")
      setDiscountValue(String(percent))
      setDiscountReason(CUSTOMER_DISCOUNT)
    } else if (percent === 0 && discountReason === CUSTOMER_DISCOUNT) {
      setDiscountType("")
      setDiscountValue("")
      setDiscountReason("")
    }
  }

  // ── submit ─────────────────────────────────────────────────────────────
  /** Sends the order (with a manager's PIN when the API asked for one); throws the API error. */
  async function send(pin?: string) {
    if (!customer) return
    const orderLines: OrderLineRequest[] = lines.map((l) => {
      const pieces = l.pieces.slice(0, pieceCount(l))
      while (pieces.length && isEmptyPiece(pieces[pieces.length - 1]!)) pieces.pop()
      return { item: l.item, service: l.service, quantity: l.quantity || "0", upcharges: l.upcharges, pieces }
    })
    const common = {
      customer: customer.id,
      is_express: express,
      // shop time without an offset; the server reads it as shop time (settings.TIME_ZONE)
      ready_by: readyBy,
      notes: [...chips, notes.trim()].filter(Boolean).join(". "),
      save_notes: saveNotes,
      bag_drop_pieces: bagDrop ? Number(bagPieces) || 0 : 0,
      lines: orderLines,
      discount_type: discountType,
      discount_value: discountType ? discountValue || "0" : "0",
      discount_reason: discountReason,
      ...(pin ? { approval_pin: pin } : {}),
    }
    if (editing) {
      const order = await updateOrder(editing.id, { ...common, reason })
      toast.success(`Order ${order.number} updated`)
      navigate(`/orders/${order.id}`, { replace: true })
    } else {
      const order = await createOrder({
        ...common,
        payment_method: paymentMethod,
        paid_amount: PAID_NOW.includes(paymentMethod) ? paidAmount || "0" : "0",
      })
      toast.success(`Order ${order.number} created`)
      navigate(`/orders/${order.id}`, { replace: true })
    }
  }

  function showError(err: unknown) {
    const fieldErrors = getApiFieldErrors(err)
    setErrors(fieldErrors)
    toast.error(
      Object.values(fieldErrors)[0] ??
        getApiErrorMessage(err, editing ? "Couldn't save the order." : "Couldn't create the order."),
    )
  }

  async function submit() {
    if (submitting) return
    if (!customer) {
      setErrors({ customer: "Choose the customer first." })
      return
    }
    if (editing && !reason.trim()) {
      setErrors({ reason: "Say why the order is being changed." })
      return
    }
    setSubmitting(true)
    setErrors({})
    try {
      await send()
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      if (fieldErrors.approval_pin) setApprovalReason(fieldErrors.approval_pin)
      else showError(err)
    } finally {
      setSubmitting(false)
    }
  }

  /** The PIN dialog resends; a wrong PIN stays in the dialog, anything else closes it. */
  async function approve(pin: string): Promise<string | null> {
    try {
      await send(pin)
      setApprovalReason(null)
      return null
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      if (fieldErrors.approval_pin) return fieldErrors.approval_pin
      setApprovalReason(null)
      showError(err)
      return null
    }
  }

  const canSubmit =
    !!customer && (lines.length > 0 || (bagDrop && Number(bagPieces) > 0)) && !missingPrice.length
  const openLine = lines.find((l) => l.key === notesLine) ?? null
  const paidSoFar = editing ? toCents(editing.paid_amount) : 0

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      {/* left: services and item tiles */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={serviceId} onValueChange={(v) => setServiceId(v as string)}>
              <TabsList className="flex-wrap">
                {catalogue.services.map((s) => (
                  <TabsTrigger key={s.id} value={s.id}>
                    {s.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:max-w-56">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search items…"
                aria-label="Search items"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tiles.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {tiles.map((item) => {
                const unit = unitPriceOf(item.id, serviceId)
                const inCart = countInCart(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id)}
                    disabled={unit === null}
                    className="relative flex min-h-20 flex-col items-start justify-between gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                  >
                    <span className="font-medium leading-tight">{item.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {unit === null ? "No express price" : formatMoney(unit)}
                      {UNIT_SUFFIX[item.pricing_type] && ` / ${UNIT_SUFFIX[item.pricing_type]}`}
                    </span>
                    {inCart > 0 && <Badge className="absolute top-2 right-2 tabular-nums">{inCart}</Badge>}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search.trim()
                ? `No items match “${search.trim()}”.`
                : "No items are priced for this service yet. Set them on the Prices page."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* right: the order */}
      <Card className="lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle>{editing ? `Edit order ${editing.number}` : "New order"}</CardTitle>
          {copiedFrom && <CardDescription>Copied from order {copiedFrom.number}.</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">
          {initial.dropped > 0 && (
            <Alert>
              <CircleAlertIcon />
              <AlertDescription>
                {initial.dropped} {initial.dropped === 1 ? "line was" : "lines were"} left out: the item or
                service is no longer sold.
              </AlertDescription>
            </Alert>
          )}

          <Field data-invalid={!!errors.customer || undefined}>
            <FieldLabel>Customer</FieldLabel>
            <CustomerPicker
              value={customer}
              onChange={chooseCustomer}
              canCreate={can("customers.create")}
              invalid={!!errors.customer}
            />
            {errors.customer && <FieldError>{errors.customer}</FieldError>}
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="grid gap-0.5">
              <Label htmlFor="order-express" className="flex items-center gap-1.5">
                <ZapIcon className="size-4" />
                Express
              </Label>
              <span className="text-xs text-muted-foreground">Express prices and a sooner ready-by.</span>
            </div>
            <Switch id="order-express" checked={express} onCheckedChange={setExpress} />
          </div>

          {/* lines */}
          <div className="grid gap-2">
            {priced.length ? (
              priced.map(({ line, unit, total }) => {
                const item = items.get(line.item)!
                const service = services.get(line.service)!
                const suffix = UNIT_SUFFIX[item.pricing_type]
                const tagged = line.pieces.slice(0, pieceCount(line))
                return (
                  <div key={line.key} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid min-w-0">
                        <span className="truncate font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {service.name} ·{" "}
                          {unit === null ? "no price" : `${formatMoney(unit)}${suffix ? ` / ${suffix}` : " each"}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium tabular-nums">{total === null ? "—" : formatMoney(fromCents(total))}</span>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} onClick={() => removeLine(line.key)}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.pricing_type === "unit" ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="One less"
                            onClick={() =>
                              Number(line.quantity) <= 1
                                ? removeLine(line.key)
                                : updateLine(line.key, { quantity: String(Number(line.quantity) - 1) })
                            }
                          >
                            <MinusIcon />
                          </Button>
                          <Input
                            className="h-8 w-14 text-center tabular-nums"
                            inputMode="numeric"
                            aria-label={`${item.name} pieces`}
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value.replace(/\D/g, "") })}
                          />
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="One more"
                            onClick={() => updateLine(line.key, { quantity: String((Number(line.quantity) || 0) + 1) })}
                          >
                            <PlusIcon />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Input
                            className="h-8 w-20 text-right tabular-nums"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.1}
                            aria-label={`${item.name} ${suffix}`}
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          />
                          <span className="text-sm text-muted-foreground">{suffix}</span>
                        </div>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pieceCount(line) === 0}
                        onClick={() => setNotesLine(line.key)}
                      >
                        <TagIcon data-icon="inline-start" />
                        Item notes
                        {tagged.length > 0 && (
                          <Badge variant="secondary" className="tabular-nums">
                            {tagged.filter((p) => !isEmptyPiece(p)).length}
                          </Badge>
                        )}
                      </Button>

                      {catalogue.upcharges.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                            <PlusIcon data-icon="inline-start" />
                            Upcharge
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-52">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Upcharges</DropdownMenuLabel>
                              {catalogue.upcharges.map((u) => (
                                <DropdownMenuCheckboxItem
                                  key={u.id}
                                  checked={line.upcharges.includes(u.id)}
                                  onCheckedChange={(on) =>
                                    updateLine(line.key, {
                                      upcharges: on ? [...line.upcharges, u.id] : line.upcharges.filter((x) => x !== u.id),
                                    })
                                  }
                                >
                                  <span className="flex-1">{u.name}</span>
                                  <span className="text-muted-foreground tabular-nums">
                                    {u.charge_type === "percent" ? `${Number(u.amount)}%` : formatMoney(u.amount)}
                                  </span>
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {line.upcharges.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {line.upcharges.map((id) => (
                          <Badge key={id} variant="secondary" className="gap-1">
                            {upcharges.get(id)?.name}
                            <button
                              type="button"
                              aria-label={`Remove ${upcharges.get(id)?.name}`}
                              onClick={() => updateLine(line.key, { upcharges: line.upcharges.filter((x) => x !== id) })}
                            >
                              <XIcon className="size-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {tagged.some((p) => !isEmptyPiece(p)) && (
                      <ul className="grid gap-0.5 text-xs text-muted-foreground">
                        {tagged.map((p, i) =>
                          isEmptyPiece(p) ? null : (
                            <li key={i}>
                              <span className="tabular-nums">#{i + 1}</span> {pieceSummary(p)}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Tap items on the left to add them.
              </p>
            )}
            {missingPrice.length > 0 && (
              <p className="text-sm text-destructive">
                {express
                  ? "Some items have no express price. Remove them or turn express off."
                  : "Some items have no price. Remove them."}
              </p>
            )}
          </div>

          {/* bag drop */}
          <div className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <Label htmlFor="order-bag-drop" className="flex items-center gap-1.5">
                  <PackageIcon className="size-4" />
                  Bag drop
                </Label>
                <span className="text-xs text-muted-foreground">
                  {editing && initial.bagPieces
                    ? "Add the items now and turn this off, or keep the count."
                    : "Count the pieces now, add the items later."}
                </span>
              </div>
              <Switch id="order-bag-drop" checked={bagDrop} onCheckedChange={setBagDrop} />
            </div>
            {bagDrop && (
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 w-24 tabular-nums"
                  inputMode="numeric"
                  aria-label="Pieces in the bag"
                  placeholder="0"
                  value={bagPieces}
                  onChange={(e) => setBagPieces(e.target.value.replace(/\D/g, ""))}
                />
                <span className="text-sm text-muted-foreground">pieces</span>
              </div>
            )}
          </div>

          {/* notes */}
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="order-notes">Notes</FieldLabel>
              <Label htmlFor="order-save-notes" className="gap-2 text-xs font-normal text-muted-foreground">
                Save for next time
                <Switch
                  id="order-save-notes"
                  size="sm"
                  checked={saveNotes}
                  disabled={!customer}
                  onCheckedChange={setSaveNotes}
                />
              </Label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {noteChips.map((chip) => {
                const on = chips.includes(chip)
                return (
                  <Button
                    key={chip}
                    type="button"
                    size="xs"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    onClick={() => setChips((prev) => (on ? prev.filter((c) => c !== chip) : [...prev, chip]))}
                  >
                    {chip}
                  </Button>
                )
              })}
            </div>
            <Textarea
              id="order-notes"
              rows={2}
              placeholder="Anything else staff should know"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {/* ready-by */}
          <Field data-invalid={!!errors.ready_by || undefined}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="order-ready-by">Ready by</FieldLabel>
              {readyBy !== null && (
                <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setReadyBy(null)}>
                  Use suggestion
                </Button>
              )}
            </div>
            <Input
              id="order-ready-by"
              type="datetime-local"
              value={readyBy ?? suggestion}
              aria-invalid={!!errors.ready_by || undefined}
              onChange={(e) => setReadyBy(e.target.value || null)}
            />
            {errors.ready_by && <FieldError>{errors.ready_by}</FieldError>}
          </Field>

          <Separator />

          {/* discount */}
          <div className="grid gap-2">
            <Label>Discount</Label>
            <div className="flex gap-2">
              <SelectField
                aria-label="Discount type"
                className="w-36"
                value={discountType}
                options={discountOptions}
                onValueChange={(v) => setDiscountType((v ?? "") as DiscountType)}
              />
              {discountType && (
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  aria-label="Discount value"
                  aria-invalid={!!errors.discount_value || undefined}
                  placeholder={discountType === "percent" ? "%" : "AED"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              )}
            </div>
            {discountType && (
              <Input
                aria-label="Discount reason"
                placeholder="Reason (required)"
                aria-invalid={!!errors.discount_reason || undefined}
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            )}
            {overLimit && (
              <p className="text-xs text-muted-foreground">
                Over your {Number(catalogue.discount_limit)}% limit: a manager's PIN will be asked.
              </p>
            )}
            {(errors.discount_value || errors.discount_reason) && (
              <p className="text-sm text-destructive">{errors.discount_value ?? errors.discount_reason}</p>
            )}
          </div>

          {/* payment (new orders; an edited order is paid from its page) */}
          {!editing && (
            <div className="grid gap-2">
              <Label>Payment</Label>
              <div className="flex gap-2">
                <SelectField
                  aria-label="Payment method"
                  className="flex-1"
                  value={paymentMethod}
                  options={paymentOptions}
                  onValueChange={(v) => v && setPaymentMethod(v as PaymentMethod)}
                />
                {PAID_NOW.includes(paymentMethod) && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    className="w-28"
                    aria-label="Amount paid"
                    aria-invalid={!!errors.paid_amount || undefined}
                    placeholder="Paid"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                )}
              </div>
              {PAID_NOW.includes(paymentMethod) && (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto w-fit p-0"
                  onClick={() => setPaidAmount(fromCents(totals.total))}
                >
                  Paid in full ({formatMoney(fromCents(totals.total))})
                </Button>
              )}
              {(errors.paid_amount || errors.payment_method) && (
                <p className="text-sm text-destructive">{errors.paid_amount ?? errors.payment_method}</p>
              )}
            </div>
          )}

          {/* totals */}
          <dl className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm tabular-nums">
            <TotalRow label="Subtotal" value={totals.subtotal} />
            {totals.discount > 0 && <TotalRow label="Discount" value={-totals.discount} />}
            <TotalRow label="Total" value={totals.total} strong />
            <TotalRow label={`VAT ${Number(catalogue.settings.vat_rate)}% included`} value={totals.vat} muted />
            {editing && paidSoFar > 0 && (
              <>
                <TotalRow label="Paid so far" value={paidSoFar} />
                <TotalRow label="Balance" value={Math.max(totals.total - paidSoFar, 0)} strong />
              </>
            )}
            {!editing && PAID_NOW.includes(paymentMethod) && paidCents > 0 && (
              <>
                <TotalRow label="Paid now" value={paidCents} />
                <TotalRow label="Balance" value={Math.max(totals.total - paidCents, 0)} strong />
              </>
            )}
          </dl>

          {editing && (
            <Field data-invalid={!!errors.reason || undefined}>
              <FieldLabel htmlFor="order-edit-reason">Reason for the change</FieldLabel>
              <Input
                id="order-edit-reason"
                placeholder="e.g. Customer added 2 shirts"
                maxLength={200}
                value={reason}
                aria-invalid={!!errors.reason || undefined}
                onChange={(e) => setReason(e.target.value)}
              />
              {errors.reason ? (
                <FieldError>{errors.reason}</FieldError>
              ) : (
                Number(editing.paid_amount) > 0 && (
                  <p className="text-xs text-muted-foreground">This order has been paid: a manager must approve.</p>
                )
              )}
            </Field>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-2 border-t">
          <Button size="lg" className="w-full" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting && <Spinner data-icon="inline-start" />}
            {editing ? "Save changes" : "Create order"} · {formatMoney(fromCents(totals.total))}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to={editing ? `/orders/${editing.id}` : "/orders"} />}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>

      <PieceNotesDialog
        title={openLine ? `${items.get(openLine.item)?.name} · ${services.get(openLine.service)?.name}` : null}
        count={openLine ? pieceCount(openLine) : 0}
        pieces={openLine?.pieces ?? []}
        tags={catalogue.piece_tags}
        onSave={(pieces) => {
          if (openLine) updateLine(openLine.key, { pieces })
          setNotesLine(null)
        }}
        onClose={() => setNotesLine(null)}
      />
      <ApprovalPinDialog reason={approvalReason} onApprove={approve} onCancel={() => setApprovalReason(null)} />
    </div>
  )
}

function TotalRow({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <dt>{label}</dt>
      <dd>{value < 0 ? `− ${formatMoney(fromCents(-value))}` : formatMoney(fromCents(value))}</dd>
    </div>
  )
}
