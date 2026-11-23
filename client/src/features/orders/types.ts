// Mirrors orders.serializers (api/orders). Money is a decimal string, e.g. "8.50", VAT-inclusive.
import type { ItemCategory, PricingType } from "@/features/catalogue/types"
import type { PreferenceList } from "@/features/customers/types"

/** A common master value as the counter needs it. */
export type MasterOption = { code: string; name: string }

export type OrderStatus = "received" | "ready" | "collected" | "cancelled"
export type PaymentMethod = "on_collection" | "cash" | "card" | "bank" | "on_account"
export type DiscountType = "" | "amount" | "percent"

export const STATUS_LABELS: Record<OrderStatus, string> = {
  received: "Received",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
}

/** Methods where money changes hands at the counter now. */
export const PAID_NOW: PaymentMethod[] = ["cash", "card", "bank"]

/** GET /api/pos/catalogue/ — what the New Order screen needs. */
export interface PosCatalogue {
  /** The default price list. */
  price_list: { id: string; name: string }
  price_lists: { id: string; name: string }[]
  services: { id: string; name: string }[]
  items: {
    id: string
    name: string
    category: ItemCategory
    category_name: string
    pricing_type: PricingType
    pricing_type_name: string
  }[]
  /** Every active price list's prices (a customer's own list, the default list for the rest). */
  prices: {
    price_list: string
    item: string
    service: string
    price: string
    express_price: string | null
    min_price: string | null
    extra_days: number
  }[]
  upcharges: { id: string; name: string; charge_type: "fixed" | "percent"; amount: string }[]
  /** From Common Masters (active values, in order). */
  payment_methods: MasterOption[]
  discount_types: MasterOption[]
  order_notes: MasterOption[]
  /** Lines per item and service at this branch over the last 90 days (most used first). */
  usage: { item: string; service: string; count: number }[]
  /** The tags for each piece (Common Masters ITEM_COLOUR / ITEM_DAMAGE / ITEM_STAIN). */
  piece_tags: Record<PieceTag, MasterOption[]>
  preferences: PreferenceList[]
  /** The biggest discount % this user may give without a manager; null = no limit. */
  discount_limit: string | null
  settings: { vat_rate: string; ready_days: number; express_ready_days: number; ready_time: string }
}

export type PieceTag = "colours" | "damage" | "stains"

/** The tags of one piece (names from the lists) and a note. */
export interface PieceNote {
  colours: string[]
  damage: string[]
  stains: string[]
  note: string
}

export interface OrderLineRequest {
  item: string
  service: string
  /** Pieces, kg or m². */
  quantity: string
  upcharges: string[]
  notes?: string
  /** Piece 1 first; empty pieces at the end can be left out. */
  pieces?: PieceNote[]
}

export interface OrderRequest {
  customer: string
  is_express: boolean
  /** Shop time "2026-11-24T18:00" (no offset); null = the server's suggestion. */
  ready_by: string | null
  notes: string
  /** Keep the notes on the customer; they fill in on their next order. */
  save_notes: boolean
  bag_drop_pieces: number
  lines: OrderLineRequest[]
  discount_type: DiscountType
  discount_value: string
  discount_reason: string
  payment_method: PaymentMethod
  paid_amount: string
  /** A manager's PIN, when the API asked for one (field error on approval_pin). */
  approval_pin?: string
}

/** PUT /api/orders/<id>/ — no money here (Pay / Refund); a reason for the timeline. */
export type OrderUpdateRequest = Omit<OrderRequest, "payment_method" | "paid_amount"> & { reason: string }

export interface OrderListRow {
  id: string
  number: string
  customer: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
  /** PRODUCTION_STAGE code while in the workshop; null = not started (or ready). */
  stage: string | null
  stage_name: string
  /** Where a ready order is kept, e.g. "B-12". */
  rack: string
  is_express: boolean
  ready_by: string
  pieces: number
  /** What is in the order, one entry per line. */
  summary: OrderSummaryLine[]
  notes: string
  /** The customer's preferences when the order was taken. */
  preferences: string
  total: string
  paid_amount: string
  balance: string
  /** When it was cleaned (moved to Ready). */
  ready_at: string | null
  /** Ready and not collected for DEADSTOCK_DAYS (45) or more. */
  deadstock: boolean
  collected_at: string | null
  created_by_name: string
  created_at: string
}

export interface OrderSummaryLine {
  service: string
  service_name: string
  item_name: string
  quantity: string
  pricing_type: PricingType
}

/** A row of the order search: who took, cleaned and collected the order, and when. */
export interface OrderSearchRow extends OrderListRow {
  staff: { step: string; name: string; at: string }[]
}

/** GET /api/orders/ filters; dates are shop days "2026-11-22", from/to included. */
export interface OrderSearch {
  search_term?: string
  status?: string
  express?: "true" | "false"
  payment?: "paid" | "unpaid"
  payment_method?: string
  deadstock?: "true"
  placed_from?: string
  placed_to?: string
  ready_from?: string
  ready_to?: string
  collected_from?: string
  collected_to?: string
  paid_from?: string
  paid_to?: string
}

/** Money taken for an order, or given back (kind "refund"). */
export interface OrderPayment {
  id: string
  kind: "payment" | "refund"
  amount: string
  method: string
  method_name: string
  reason: string
  received_by_name: string
  created_at: string
}

/** One change on the order's timeline. */
export interface OrderHistoryEntry {
  status: OrderStatus
  stage_name: string
  note: string
  changed_by_name: string
  changed_at: string
}

/** GET /api/production/ — stage columns between Received and Ready, and the open orders. */
export interface ProductionBoard {
  stages: { code: string; name: string }[]
  /** For the Section filter. */
  services: { id: string; name: string }[]
  deadstock_days: number
  orders: OrderListRow[]
}

/** Where a move sends orders: "received", a stage code, "ready", or "next" (each order's next column). */
export type MoveTarget = string

export interface OrderLine {
  id: string
  item: string
  service: string
  item_name: string
  service_name: string
  pricing_type: PricingType
  quantity: string
  unit_price: string
  min_price: string | null
  upcharges: { upcharge: string; name: string; amount: string }[]
  upcharge_total: string
  line_total: string
  notes: string
  pieces: PieceNote[]
}

export interface Order extends OrderListRow {
  branch_name: string
  branch_code: string
  price_list: string
  price_list_name: string
  notes: string
  /** The customer's preferences when the order was taken, e.g. "Shirt: Boxed / Starch: No starch". */
  preferences: string
  bag_drop_pieces: number
  lines: OrderLine[]
  subtotal: string
  discount_type: DiscountType
  discount_value: string
  discount_amount: string
  discount_reason: string
  /** The manager who approved a discount over the limit. */
  discount_approved_by_name: string
  vat_amount: string
  payment_method: PaymentMethod
  payment_method_name: string
  created_by_name: string
  history: OrderHistoryEntry[]
  payments: OrderPayment[]
}
