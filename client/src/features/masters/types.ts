// Mirrors masters.serializers (api/masters): lookup lists kept in the database.

/** The list codes the app uses (api/masters/registry.py). */
export const MASTER = {
  ITEM_CATEGORY: "ITEM_CATEGORY",
  PRICING_TYPE: "PRICING_TYPE",
  UPCHARGE_TYPE: "UPCHARGE_TYPE",
  DISCOUNT_TYPE: "DISCOUNT_TYPE",
  PAYMENT_METHOD: "PAYMENT_METHOD",
  ORDER_NOTE: "ORDER_NOTE",
} as const

export type MasterTypeCode = (typeof MASTER)[keyof typeof MASTER]

export interface CommonMasterType {
  id: string
  code: MasterTypeCode
  name: string
  description: string
  /** The app decides on each value: rename, reorder or hide only (no add/delete). */
  is_fixed: boolean
  value_count: number
}

export interface CommonMaster {
  id: string
  type: MasterTypeCode
  type_name: string
  /** Stable key other records and the app use, e.g. "per_kg". Never changes. */
  code: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export type CommonMasterRequest = Pick<CommonMaster, "type" | "name" | "sort_order" | "is_active"> & { code?: string }
