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
  /** Where the customer was registered (the active branch at the time). */
  branch: string
  branch_name: string
  created_at: string
  updated_at: string
}

/** What the form sends on create/update; the server sets id, branch and dates. */
export type CustomerRequest = Pick<Customer, "name" | "phone" | "email" | "address" | "notes">
