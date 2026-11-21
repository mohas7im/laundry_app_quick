// Mirrors catalogue.serializers (api/catalogue). Money is a decimal string, e.g. "8.50", VAT-inclusive.

export interface Service {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}
export type ServiceRequest = Pick<Service, "name" | "sort_order" | "is_active">

export type ItemCategory = "men" | "women" | "kids" | "household" | "other"
export type PricingType = "unit" | "per_kg" | "per_m2"

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  men: "Men",
  women: "Women",
  kids: "Kids",
  household: "Household",
  other: "Other",
}

export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  unit: "Per item",
  per_kg: "Per kg",
  per_m2: "Per m²",
}

export interface Item {
  id: string
  name: string
  category: ItemCategory
  pricing_type: PricingType
  sort_order: number
  is_active: boolean
  created_at: string
}
export type ItemRequest = Pick<Item, "name" | "category" | "pricing_type" | "sort_order" | "is_active">

export interface PriceList {
  id: string
  name: string
  /** Used when a customer has no price list of their own. Exactly one list is the default. */
  is_default: boolean
  is_active: boolean
  price_count: number
  created_at: string
}
export type PriceListRequest = Pick<PriceList, "name" | "is_default" | "is_active">

export type ChargeType = "fixed" | "percent"

export interface Upcharge {
  id: string
  name: string
  charge_type: ChargeType
  amount: string
  sort_order: number
  is_active: boolean
  created_at: string
}
export type UpchargeRequest = Pick<Upcharge, "name" | "charge_type" | "amount" | "sort_order" | "is_active">

/** One cell of the price grid: an item for a service in one price list. */
export interface PriceCell {
  item: string
  service: string
  /** null clears the cell (not offered). */
  price: string | null
  express_price: string | null
  min_price: string | null
  extra_days: number
}

/** GET /api/prices/<price_list_id>/ */
export interface PriceGrid {
  price_list: { id: string; name: string; is_default: boolean }
  services: { id: string; name: string }[]
  items: { id: string; name: string; category: ItemCategory; pricing_type: PricingType }[]
  prices: PriceCell[]
}
