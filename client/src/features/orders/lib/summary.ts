import { shopNow } from "@/lib/format"
import type { OrderSummaryLine } from "../types"

const UNIT = { unit: "", per_kg: "kg", per_m2: "m²" } as const

/** "Kandura × 3", "Laundry by weight 2.5 kg". */
export function lineText(line: OrderSummaryLine) {
  const unit = UNIT[line.pricing_type]
  return unit ? `${line.item_name} ${line.quantity} ${unit}` : `${line.item_name} × ${line.quantity}`
}

/** The shop day of a time, "2026-11-22" (for due today / tomorrow). */
export const shopDay = (at: Date | string) => shopNow(new Date(at)).toISOString().slice(0, 10)

/** The shop day `days` from today. */
export function shopDayFromToday(days: number) {
  const day = shopNow()
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}
