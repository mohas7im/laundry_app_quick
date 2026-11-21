// API base URL and default configuration. The only place the API reads env vars.

export const API_CONFIG = {
  // Empty = same origin. In development Vite proxies /api to Django (vite.config.ts),
  // so cookies stay first-party. Set VITE_API_BASE_URL only if the API is on another host.
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  timeout: 15_000,
  withCredentials: true,
  logRequests: import.meta.env.DEV,
} as const

// Django's CSRF cookie / header names (see CSRF_* in api/config/settings.py).
export const CSRF_COOKIE_NAME = "csrftoken"
export const CSRF_HEADER_NAME = "X-CSRFToken"