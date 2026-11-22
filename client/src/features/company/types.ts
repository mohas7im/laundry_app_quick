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
  updated_at: string
}

export type CompanySettingsRequest = Omit<CompanySettings, "updated_at">
