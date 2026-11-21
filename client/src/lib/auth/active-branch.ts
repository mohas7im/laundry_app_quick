// Remembers which branch the user is working in (per browser).
// Read by the request interceptor to send X-Branch-ID; written by the auth context.

const STORAGE_KEY = "laundry.activeBranchId"

let current: number | null = load()

function load(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Number(raw) || null : null
  } catch {
    return null
  }
}

export function getActiveBranchId(): number | null {
  return current
}

export function setActiveBranchId(id: number | null): void {
  current = id
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // storage unavailable (private mode) — keep the in-memory value
  }
}
