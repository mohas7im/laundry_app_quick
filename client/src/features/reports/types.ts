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

/** GET /api/dashboard/ */
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
  cash_ups_today: ShiftReport[]
  last_7_days: { date: string; orders: number; sales: string; collected: string }[]
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
