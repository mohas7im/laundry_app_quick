// The branch used last on this device. Sent with login so the user lands back in it.
// The real active branch lives in the access token (server side); this is only a preference.

const STORAGE_KEY = "laundry.lastBranchId"

export function getLastBranchId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Number(raw) || null : null
  } catch {
    return null
  }
}

export function setLastBranchId(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // storage unavailable (private mode) — not critical
  }
}
