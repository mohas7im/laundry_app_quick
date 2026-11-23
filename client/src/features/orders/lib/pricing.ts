// The live totals on the New Order screen. Same rules as api/orders/pricing.py, in whole
// fils (cents) so there are no rounding surprises. The server recalculates on submit and
// its numbers are the ones saved.

export const toCents = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? 0 : Math.round(Number(value) * 100)

export const fromCents = (cents: number) => (cents / 100).toFixed(2)

export type LineRule = {
  unitPrice: number // cents
  quantity: number
  minPrice: number | null // cents
  upcharges: { charge_type: "fixed" | "percent"; amount: string }[]
}

/** base = unit × quantity (at least the minimum); fixed upcharges once per line, percent of the base. */
export function lineTotal({ unitPrice, quantity, minPrice, upcharges }: LineRule): number {
  let base = Math.round(unitPrice * quantity)
  if (minPrice !== null && base < minPrice) base = minPrice
  const extra = upcharges.reduce(
    (sum, u) => sum + (u.charge_type === "fixed" ? toCents(u.amount) : Math.round((base * Number(u.amount)) / 100)),
    0,
  )
  return base + extra
}

export function orderTotals(lineTotals: number[], discountType: string, discountValue: string, vatRate: string) {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0)
  let discount = 0
  if (discountType === "percent") discount = Math.round((subtotal * Number(discountValue || 0)) / 100)
  else if (discountType === "amount") discount = toCents(discountValue)
  discount = Math.min(Math.max(discount, 0), subtotal)
  const total = subtotal - discount
  const vat = Math.round(total - total / (1 + Number(vatRate) / 100))
  return { subtotal, discount, total, vat }
}

/**
 * The ready-by the counter starts with, in shop time. Same rules as the server
 * (orders/pricing.py suggested_ready_by): counting starts today, or tomorrow after the
 * cut-off; + days (express, or the slowest service) + the items' extra days; at the ready
 * time but never after closing; if already past, the next day; never on a closed weekday
 * (0 = Monday) or a holiday.
 *
 * `shopNow` holds the shop's wall-clock time in its UTC fields (lib/format shopNow);
 * the result is "2026-11-24T18:00", shop time, for <input type="datetime-local">.
 * The server reads a time without an offset as shop time.
 */
export function suggestedReadyBy(
  shopNow: Date,
  opts: {
    express: boolean
    extraDays: number
    readyDays: number
    expressReadyDays: number
    readyTime: string
    cutoff?: string | null
    closesAt?: string | null
    closedWeekdays?: number[]
    holidays?: string[]
  },
): string {
  const minutes = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }
  const nowMinutes = shopNow.getUTCHours() * 60 + shopNow.getUTCMinutes()
  const at = opts.closesAt ? Math.min(minutes(opts.readyTime), minutes(opts.closesAt)) : minutes(opts.readyTime)

  const ready = new Date(shopNow)
  if (opts.cutoff && nowMinutes >= minutes(opts.cutoff)) ready.setUTCDate(ready.getUTCDate() + 1)
  ready.setUTCDate(ready.getUTCDate() + (opts.express ? opts.expressReadyDays : opts.readyDays) + opts.extraDays)
  ready.setUTCHours(Math.floor(at / 60), at % 60, 0, 0)
  if (ready <= shopNow) ready.setUTCDate(ready.getUTCDate() + 1)

  const closed = new Set(opts.closedWeekdays ?? [])
  const holidays = new Set(opts.holidays ?? [])
  for (let i = 0; i < 60; i++) {
    const weekday = (ready.getUTCDay() + 6) % 7 // 0 = Monday, as on the server
    if (!closed.has(weekday) && !holidays.has(ready.toISOString().slice(0, 10))) break
    ready.setUTCDate(ready.getUTCDate() + 1)
  }
  return ready.toISOString().slice(0, 16)
}
