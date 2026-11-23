// Mirrors customers.serializers.CustomerSerializer
export interface Customer {
  id: string
  name: string
  /** Stored normalised, e.g. "+971501234567". */
  phone: string
  email: string
  address: string
  /** e.g. "No starch", "Call before delivery". */
  notes: string
  /** One value per preference list, e.g. { PREF_SHIRT: "boxed", PREF_STARCH: "none" }. */
  preferences: Record<string, string>
  /** e.g. "Shirt: Boxed / Starch: No starch" */
  preferences_text: string
  /** Their own price list (null = the default one). */
  price_list: string | null
  price_list_name: string
  /** Applied to every order, e.g. "10.00". */
  discount_percent: string
  /** Where the customer was registered (the active branch at the time). */
  branch: string
  branch_name: string
  /** What the customer still owes over their orders, e.g. "21.00". */
  balance: string
  created_at: string
  updated_at: string
}

/** What the form sends on create/update; the server sets id, branch and dates. */
export type CustomerRequest = Pick<
  Customer,
  "name" | "phone" | "email" | "address" | "notes" | "preferences" | "price_list" | "discount_percent"
>

/** A preference question and its options (Common Masters PREF_*). */
export interface PreferenceList {
  code: string
  name: string
  options: { code: string; name: string }[]
}

/** GET /api/customers/options/ — what the customer form offers. */
export interface CustomerOptions {
  price_lists: { id: string; name: string; is_default: boolean }[]
  preferences: PreferenceList[]
}
