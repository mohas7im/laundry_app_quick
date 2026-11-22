// Mirrors orders.serializers (api/orders). Money is a decimal string, e.g. "8.50", VAT-inclusive.
import type { ItemCategory, PricingType } from "@/features/catalogue/types"

export type OrderStatus = "received" | "ready" | "collected" | "cancelled"
export type PaymentMethod = "on_collection" | "cash" | "card" | "bank" | "on_account"
export type DiscountType = "" | "amount" | "percent"

export const STATUS_LABELS: Record<OrderStatus, string> = {
  received: "Received",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  on_collection: "Pay on collection",
  cash: "Cash",
  card: "Card",
  bank: "Bank transfer",
  on_account: "On account",
}

/** Methods where money changes hands at the counter now. */
export const PAID_NOW: PaymentMethod[] = ["cash", "card", "bank"]

/** GET /api/pos/catalogue/ — what the New Order screen needs. */
export interface PosCatalogue {
  price_list: { id: string; name: string }
  services: { id: string; name: string }[]
  items: { id: string; name: string; category: ItemCategory; pricing_type: PricingType }[]
  prices: {
    item: string
    service: string
    price: string
    express_price: string | null
    min_price: string | null
    extra_days: number
  }[]
  upcharges: { id: string; name: string; charge_type: "fixed" | "percent"; amount: string }[]
  settings: { vat_rate: string; ready_days: number; express_ready_days: number; ready_time: string }
}

export interface OrderLineRequest {
  item: string
  service: string
  /** Pieces, kg or m². */
  quantity: string
  upcharges: string[]
  notes?: string
}

export interface OrderRequest {
  customer: string
  is_express: boolean
  /** Shop time "2026-11-24T18:00" (no offset); null = the server's suggestion. */
  ready_by: string | null
  notes: string
  bag_drop_pieces: number
  lines: OrderLineRequest[]
  discount_type: DiscountType
  discount_value: string
  discount_reason: string
  payment_method: PaymentMethod
  paid_amount: string
}

export interface OrderListRow {
  id: string
  number: string
  customer: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
  is_express: boolean
  ready_by: string
  pieces: number
  total: string
  paid_amount: string
  balance: string
  created_at: string
}

export interface OrderLine {
  id: string
  item_name: string
  service_name: string
  pricing_type: PricingType
  quantity: string
  unit_price: string
  min_price: string | null
  upcharges: { name: string; amount: string }[]
  upcharge_total: string
  line_total: string
  notes: string
}

export interface Order extends OrderListRow {
  branch_name: string
  branch_code: string
  price_list_name: string
  notes: string
  bag_drop_pieces: number
  lines: OrderLine[]
  subtotal: string
  discount_type: DiscountType
  discount_value: string
  discount_amount: string
  discount_reason: string
  vat_amount: string
  payment_method: PaymentMethod
  created_by_name: string
}
