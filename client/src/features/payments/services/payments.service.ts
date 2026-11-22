// Payments, refunds, customer balances and cash-up shifts. Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { Order } from "@/features/orders/types"
import type { CustomerBalance, PaymentsDay, ShiftReport } from "../types"

// ── payments on an order ──
/** Take money for an order (up to its balance). Returns the updated order. */
export const payOrder = (orderId: string, amount: string, paymentMethod: string) =>
  http.post<Order>(ENDPOINTS.orders.pay(orderId), { amount, payment_method: paymentMethod })

/** Give money back (up to what was paid), with a reason. Returns the updated order. */
export const refundOrder = (orderId: string, amount: string, paymentMethod: string, reason: string) =>
  http.post<Order>(ENDPOINTS.orders.refund(orderId), { amount, payment_method: paymentMethod, reason })

/** Payments and refunds at the active branch on one day (YYYY-MM-DD, shop time). */
export const getPaymentsDay = (date: string) => http.get<PaymentsDay>(ENDPOINTS.payments.list, { params: { date } })

// ── customer balance ──
export const getCustomerBalance = (customerId: string) =>
  http.get<CustomerBalance>(ENDPOINTS.customerBalance.balance(customerId))

/** One payment spread over the customer's unpaid orders, oldest first. */
export const settleCustomer = (customerId: string, amount: string, paymentMethod: string) =>
  http.post<{ paid_orders: string[] }>(ENDPOINTS.customerBalance.settle(customerId), {
    amount,
    payment_method: paymentMethod,
  })

// ── cash-up shifts ──
/** My open shift at the active branch, or null. */
export const getCurrentShift = () => http.get<ShiftReport | null>(ENDPOINTS.shifts.current)
export const openShift = (openingFloat: string, notes = "") =>
  http.post<ShiftReport>(ENDPOINTS.shifts.open, { opening_float: openingFloat, notes })
export const closeShift = (countedCash: string, notes = "") =>
  http.post<ShiftReport>(ENDPOINTS.shifts.close, { counted_cash: countedCash, notes })
export const getShifts = () => http.get<ShiftReport[]>(ENDPOINTS.shifts.list)
