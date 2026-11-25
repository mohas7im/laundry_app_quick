// Mirrors api/reports/queries.py. Money is a decimal string, e.g. "121.00"; days are shop days.
import type { ShiftReport } from "@/features/payments/types"

export interface Sales {
  orders: number
  express_orders: number
  pieces: number
  subtotal: string
  discounts: string
  /** VAT included. */
  sales: string
  vat: string
  sales_excl_vat: string
  average_order: string
}

export interface Collected {
  taken: string
  refunded: string
  net: string
  methods: { method: string; method_name: string; taken: string; refunded: string; net: string; count: number }[]
}

export interface OnTime {
  ready: number
  on_time: number
  /** null when nothing became ready in the period. */
  percent: number | null
}

export type SeriesRange = "7d" | "30d" | "month"

/** An order in one of the dashboard's "needs attention" lists. */
export interface AttentionOrder {
  id: string
  number: string
  customer_name: string
  customer_phone: string
  is_express: boolean
  /** overdue: ready-by time · not collected: when it became ready · unpaid: when it was taken */
  date: string
  balance: string
}

export interface AttentionList {
  /** All matching orders; `orders` holds the oldest few. */
  count: number
  orders: AttentionOrder[]
}

/** GET /api/dashboard/?range= */
export interface Dashboard {
  branch_name: string
  date: string
  today: { sales: Sales; collected: Collected }
  yesterday: { sales: Sales; collected: Collected }
  operations: {
    wip: { code: string; name: string; orders: number }[]
    overdue: number
    overdue_express: number
    oldest_overdue: { number: string; ready_by: string } | null
    ready_to_collect: number
    uncollected_aging: { days: string; orders: number }[]
  }
  on_time_30_days: OnTime
  receivables: { total: string; customers: number; aging: { days: string; amount: string }[] }
  attention: { overdue: AttentionList; not_collected: AttentionList; unpaid: AttentionList }
  series_range: SeriesRange
  series: { date: string; orders: number; sales: string; collected: string }[]
  top_items_30_days: { item_name: string; quantity: string; sales: string }[]
}

/** GET /api/reports/daily/?date= */
export interface DailySummary {
  branch_name: string
  branch_code: string
  date: string
  sales: Sales
  collected: Collected
  on_time: OnTime
  cash_ups: ShiftReport[]
  top_items: { item_name: string; quantity: string; sales: string }[]
}
