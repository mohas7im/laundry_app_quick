const money = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "8.5" → "AED 8.50" (prices are VAT-inclusive). Empty → "—". */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  return `AED ${money.format(Number(value))}`
}

/**
 * The shop's time zone (api settings.TIME_ZONE). Times are always shown and entered in
 * shop time, whatever time zone the browser is in.
 */
export const SHOP_TIME_ZONE = "Asia/Dubai"

/** A date/time formatter in shop time, e.g. shopDateFormat({ day: "numeric", month: "short" }). */
export const shopDateFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: SHOP_TIME_ZONE })

/** The shop's wall-clock time now, as a Date whose UTC fields hold it (for date arithmetic). */
export function shopNow(at: Date = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: SHOP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return new Date(Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!))
}
