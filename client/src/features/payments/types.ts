// Mirrors api/orders (payments) and api/cashier (shifts). Money is a decimal string, e.g. "8.50".
import type { OrderListRow } from "@/features/orders/types"

/** Payments and refunds can be cash, card or bank transfer. */
export const MONEY_METHODS = ["cash", "card", "bank"] as const

/** GET /api/payments/?date= — one row. */
export interface PaymentRow {
  id: string
  kind: "payment" | "refund"
  amount: string
  method: string
  method_name: string
  reason: string
  order: string
  order_number: string
  customer_name: string
  received_by_name: string
  created_at: string
}

export interface MethodTotal {
  method: string
  method_name: string
  taken: string
  refunded: string
  net: string
}

export interface PaymentsDay {
  date: string
  payments: PaymentRow[]
  totals: MethodTotal[]
}

/** GET /api/customers/<id>/balance/ */
export interface CustomerBalance {
  customer: string
  customer_name: string
  balance: string
  orders: (OrderListRow & { branch_code: string })[]
}

/** A shift's cash-up (api/cashier/report.py). */
export interface ShiftReport {
  id: string
  branch: string
  branch_name: string
  opened_by_name: string
  opened_at: string
  closed_at: string | null
  is_open: boolean
  opening_float: string
  cash_taken: string
  cash_refunded: string
  /** Float + cash taken − cash given back. Fixed when the shift closes. */
  expected_cash: string
  counted_cash: string | null
  /** Counted − expected: negative = short, positive = over. */
  difference: string | null
  notes: string
  methods: { method: string; taken: string; refunded: string; net: string; count: number }[]
  total_taken: string
  total_refunded: string
}
