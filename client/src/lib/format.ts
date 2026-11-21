const money = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "8.5" → "AED 8.50" (prices are VAT-inclusive). Empty → "—". */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  return `AED ${money.format(Number(value))}`
}
