// Django CSRF helpers. The access token lives in an HttpOnly cookie that the browser
// sends automatically, so Django requires the csrftoken cookie value echoed back in
// the X-CSRFToken header on every POST/PUT/PATCH/DELETE.
import { API_CONFIG, CSRF_COOKIE_NAME } from "./config"
import { ENDPOINTS } from "./endpoints"

export function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`))
  return match ? decodeURIComponent(match[1]!) : null
}

let inFlightCsrf: Promise<string | null> | null = null

/** Returns the CSRF token, fetching the cookie from Django first if it's missing. */
export function ensureCsrfToken(): Promise<string | null> {
  const existing = getCsrfToken()
  if (existing) return Promise.resolve(existing)

  // Plain fetch, not apiClient, so this never loops through the interceptors.
  inFlightCsrf ??= fetch(`${API_CONFIG.baseURL}${ENDPOINTS.auth.csrf}`, {
    credentials: "include",
  })
    .then(() => getCsrfToken())
    .catch(() => null)
    .finally(() => {
      inFlightCsrf = null
    })

  return inFlightCsrf
}
