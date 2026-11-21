// Client-side session helpers used by apiClient's response interceptor.
import { API_CONFIG } from "@/lib/api/config"
import { ENDPOINTS } from "@/lib/api/endpoints"

export const LOGIN_PATH = "/login"

let inFlightRefresh: Promise<boolean> | null = null

/**
 * Exchanges the refresh-token cookie for a new token pair. Concurrent callers
 * share one request: Django rotates the refresh token and blacklists the old one,
 * so two parallel refreshes would make the second one fail and log the user out.
 */
export function refreshSession(): Promise<boolean> {
  // Plain fetch, not apiClient: a refresh must never trigger the 401 interceptor.
  inFlightRefresh ??= fetch(`${API_CONFIG.baseURL}${ENDPOINTS.auth.refresh}`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      inFlightRefresh = null
    })

  return inFlightRefresh
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return

  const { pathname, search } = window.location
  if (pathname.startsWith(LOGIN_PATH)) return

  const next = encodeURIComponent(pathname + search)
  window.location.href = `${LOGIN_PATH}?expired=1&next=${next}`
}
