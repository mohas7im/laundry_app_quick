import { useCallback, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { CircleAlertIcon, MinusIcon, PackageIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon, ZapIcon } from "lucide-react"
import { toast } from "sonner"

import { SelectField } from "@/components/select-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { Customer } from "@/features/customers/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopNow } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { CustomerPicker } from "../components/customer-picker"
import { fromCents, lineTotal, orderTotals, suggestedReadyBy, toCents } from "../lib/pricing"
import { createOrder, getPosCatalogue } from "../services/order.service"
import {
  PAID_NOW,
  PAYMENT_METHOD_LABELS,
  type DiscountType,
  type OrderRequest,
  type PaymentMethod,
  type PosCatalogue,
} from "../types"

type CartLine = { key: string; item: string; service: string; quantity: string; upcharges: string[] }

const UNIT_SUFFIX = { unit: "", per_kg: "kg", per_m2: "m²" } as const

/** Quick notes the counter adds with one tap (build pack: nesha / hanger / fold). */
const NOTE_CHIPS = ["No starch", "Light starch", "Heavy starch", "On hanger", "Folded"]

const PAYMENT_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))
const DISCOUNT_OPTIONS = [
  { value: "", label: "No discount" },
  { value: "amount", label: "AED" },
  { value: "percent", label: "%" },
]

const priceKey = (item: string, service: string) => `${item}:${service}`

export function NewOrderPage() {
  const catalogue = useRecords(getPosCatalogue, null as PosCatalogue | null)

  if (catalogue.loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    )
  }
  if (catalogue.error || !catalogue.data) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Can't take orders yet</EmptyTitle>
          <EmptyDescription>{getApiErrorMessage(catalogue.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={catalogue.retry}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return <PosScreen catalogue={catalogue.data} />
}

function PosScreen({ catalogue }: { catalogue: PosCatalogue }) {
  const navigate = useNavigate()
  const { can } = useAuth()

  const prices = useMemo(() => new Map(catalogue.prices.map((p) => [priceKey(p.item, p.service), p])), [catalogue])
  const items = useMemo(() => new Map(catalogue.items.map((i) => [i.id, i])), [catalogue])
  const services = useMemo(() => new Map(catalogue.services.map((s) => [s.id, s])), [catalogue])
  const upcharges = useMemo(() => new Map(catalogue.upcharges.map((u) => [u.id, u])), [catalogue])

  const [serviceId, setServiceId] = useState(catalogue.services[0]?.id ?? "")
  const [search, setSearch] = useState("")
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [express, setExpress] = useState(false)
  const [lines, setLines] = useState<CartLine[]>([])
  const [bagDrop, setBagDrop] = useState(false)
  const [bagPieces, setBagPieces] = useState("")
  const [chips, setChips] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [readyBy, setReadyBy] = useState<string | null>(null) // null = the suggestion
  const [discountType, setDiscountType] = useState<DiscountType>("")
  const [discountValue, setDiscountValue] = useState("")
  const [discountReason, setDiscountReason] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("on_collection")
  const [paidAmount, setPaidAmount] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  // the ready-by suggestion counts from when the screen opened
  const [openedAt] = useState(() => shopNow())

  // ── pricing (live; the server recalculates on submit) ──────────────────
  const unitPriceOf = useCallback(
    (item: string, service: string) => {
      const p = prices.get(priceKey(item, service))
      if (!p) return null
      return express ? p.express_price : p.price
    },
    [prices, express],
  )

  const priced = lines.map((line) => {
    const p = prices.get(priceKey(line.item, line.service))
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
  const missingExpress = priced.filter((p) => p.total === null)
  const totals = orderTotals(
    priced.map((p) => p.total ?? 0),
    discountType,
    discountValue,
    catalogue.settings.vat_rate,
  )
  const paidCents = toCents(paidAmount)

  const extraDays = Math.max(0, ...lines.map((l) => prices.get(priceKey(l.item, l.service))?.extra_days ?? 0))
  // shop time, e.g. "2026-11-24T18:00"
  const suggestion = suggestedReadyBy(openedAt, {
    express,
    extraDays,
    readyDays: catalogue.settings.ready_days,
    expressReadyDays: catalogue.settings.express_ready_days,
    readyTime: catalogue.settings.ready_time,
  })

  // ── tiles ──────────────────────────────────────────────────────────────
  const tiles = useMemo(() => {
    const term = search.trim().toLowerCase()
    return catalogue.items.filter(
      (i) => prices.has(priceKey(i.id, serviceId)) && (!term || i.name.toLowerCase().includes(term)),
    )
  }, [catalogue, prices, serviceId, search])

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
      return [...prev, { key: crypto.randomUUID(), item: itemId, service: serviceId, quantity: "1", upcharges: [] }]
    })
  }

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))

  // ── submit ─────────────────────────────────────────────────────────────
  async function submit() {
    if (submitting) return
    if (!customer) {
      setErrors({ customer: "Choose the customer first." })
      return
    }
    setSubmitting(true)
    setErrors({})
    const payload: OrderRequest = {
      customer: customer.id,
      is_express: express,
      // shop time without an offset; the server reads it as shop time (settings.TIME_ZONE)
      ready_by: readyBy,
      notes: [...chips, notes.trim()].filter(Boolean).join(". "),
      bag_drop_pieces: bagDrop ? Number(bagPieces) || 0 : 0,
      lines: lines.map((l) => ({ item: l.item, service: l.service, quantity: l.quantity || "0", upcharges: l.upcharges })),
      discount_type: discountType,
      discount_value: discountType ? discountValue || "0" : "0",
      discount_reason: discountReason,
      payment_method: paymentMethod,
      paid_amount: PAID_NOW.includes(paymentMethod) ? paidAmount || "0" : "0",
    }
    try {
      const order = await createOrder(payload)
      toast.success(`Order ${order.number} created`)
      navigate(`/orders/${order.id}`, { replace: true })
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      toast.error(Object.values(fieldErrors)[0] ?? getApiErrorMessage(err, "Couldn't create the order."))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!customer && (lines.length > 0 || (bagDrop && Number(bagPieces) > 0)) && !missingExpress.length

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
          <CardTitle>New order</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field data-invalid={!!errors.customer || undefined}>
            <FieldLabel>Customer</FieldLabel>
            <CustomerPicker
              value={customer}
              onChange={(c) => {
                setCustomer(c)
                setErrors(({ customer: _gone, ...rest }) => rest)
              }}
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
                return (
                  <div key={line.key} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid min-w-0">
                        <span className="truncate font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {service.name} · {unit === null ? "no express price" : `${formatMoney(unit)}${suffix ? ` / ${suffix}` : " each"}`}
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
                  </div>
                )
              })
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Tap items on the left to add them.
              </p>
            )}
            {missingExpress.length > 0 && (
              <p className="text-sm text-destructive">
                Some items have no express price. Remove them or turn express off.
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
                <span className="text-xs text-muted-foreground">Count the pieces now, add the items later.</span>
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
            <FieldLabel htmlFor="order-notes">Notes</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_CHIPS.map((chip) => {
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
                options={DISCOUNT_OPTIONS}
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
            {(errors.discount_value || errors.discount_reason) && (
              <p className="text-sm text-destructive">{errors.discount_value ?? errors.discount_reason}</p>
            )}
          </div>

          {/* payment */}
          <div className="grid gap-2">
            <Label>Payment</Label>
            <div className="flex gap-2">
              <SelectField
                aria-label="Payment method"
                className="flex-1"
                value={paymentMethod}
                options={PAYMENT_OPTIONS}
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

          {/* totals */}
          <dl className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm tabular-nums">
            <TotalRow label="Subtotal" value={totals.subtotal} />
            {totals.discount > 0 && <TotalRow label="Discount" value={-totals.discount} />}
            <TotalRow label="Total" value={totals.total} strong />
            <TotalRow label={`VAT ${Number(catalogue.settings.vat_rate)}% included`} value={totals.vat} muted />
            {PAID_NOW.includes(paymentMethod) && paidCents > 0 && (
              <>
                <TotalRow label="Paid now" value={paidCents} />
                <TotalRow label="Balance" value={Math.max(totals.total - paidCents, 0)} strong />
              </>
            )}
          </dl>
        </CardContent>
        <CardFooter className="flex-col gap-2 border-t">
          <Button size="lg" className="w-full" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting && <Spinner data-icon="inline-start" />}
            Create order · {formatMoney(fromCents(totals.total))}
          </Button>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/orders" />}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
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
