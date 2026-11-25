// Mirrors api/company: one record for the whole business.
export interface CompanySettings {
  name: string
  /** A data URL ("data:image/png;base64,…", at most 300 KB), or "" for no logo. */
  logo: string
  address: string
  phone: string
  email: string
  /** Terms printed at the bottom of every receipt. */
  receipt_footer: string
  /** branch: KC33-00001 per branch; company: 3001, 3002, … one sequence for all branches. */
  invoice_numbering: InvoiceNumbering
  /** The number the next order gets with one-sequence numbering. */
  next_invoice_number: number
  updated_at: string
}

export type InvoiceNumbering = "branch" | "company"

/** next_invoice_number is sent only when changed, so a save never moves the counter back. */
export type CompanySettingsRequest = Omit<CompanySettings, "updated_at" | "next_invoice_number"> & {
  next_invoice_number?: number
}
