// Mirrors catalogue.serializers (api/catalogue). Money is a decimal string, e.g. "8.50", VAT-inclusive.

export interface Service {
  id: string
  name: string
  /** Days to get it ready (normal orders); null = the shop's default. */
  ready_days: number | null
  sort_order: number
  is_active: boolean
  created_at: string
}
export type ServiceRequest = Pick<Service, "name" | "ready_days" | "sort_order" | "is_active">

/** An ITEM_CATEGORY common master code ("men", "women" … admins can add more). */
export type ItemCategory = string
/** PRICING_TYPE common master codes: fixed, the pricing rules depend on them. */
export type PricingType = "unit" | "per_kg" | "per_m2"

export interface Item {
  id: string
  name: string
  category: ItemCategory
  category_name: string
  pricing_type: PricingType
  pricing_type_name: string
  /** Pieces (tags) per item, e.g. a 2-piece suit = 2. */
  pieces: number
  sort_order: number
  is_active: boolean
  created_at: string
}
export type ItemRequest = Pick<Item, "name" | "category" | "pricing_type" | "pieces" | "sort_order" | "is_active">

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
  charge_type_name: string
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
  items: {
    id: string
    name: string
    category: ItemCategory
    category_name: string
    pricing_type: PricingType
    pricing_type_name: string
    pieces: number
  }[]
  prices: PriceCell[]
}

/** One change in the price history (a new price has no old values, a removed one no new values). */
export interface PriceChange {
  id: string
  item: string
  item_name: string
  service: string
  service_name: string
  old_price: string | null
  new_price: string | null
  old_express_price: string | null
  new_express_price: string | null
  source: "grid" | "import"
  source_name: string
  changed_by_name: string
  changed_at: string
}

/** A section of the CSV and where it goes: a service, in the main or the online price list. */
export interface ImportSection {
  section: string
  rows: number
  service: string
  price_list: "main" | "online"
  service_exists: boolean
}

type Counts = { new: number; changed: number; same: number }

/** POST /api/catalogue/import/ */
export interface ImportResult {
  sections: ImportSection[]
  summary: {
    rows: number
    skipped_inactive: number
    new_services: string[]
    new_items: number
    items_pieces_changed: number
    main_price_list: string
    online_price_list: string
    prices: { main: Counts; online: Counts }
  }
  errors: { line: number | null; message: string }[]
  warnings: { line: number | null; message: string }[]
  imported: boolean
}

export interface ImportRequest {
  csv: string
  sections?: Pick<ImportSection, "section" | "service" | "price_list">[]
  /** Normal sections' prices go here; default: the default price list. */
  main_price_list?: string | null
  online_price_list?: string
  commit: boolean
}
