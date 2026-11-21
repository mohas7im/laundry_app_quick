import { isAxiosError } from "axios"

import type { ApiError } from "./base-api"

/**
 * Django REST Framework error shapes:
 *   { detail: "Authentication credentials were not provided." }
 *   { non_field_errors: ["Invalid email or password."] }
 *   { email: ["Enter a valid email address."], password: ["This field is required."] }
 */
type DrfErrorBody = string | { detail?: string } | Record<string, string[] | string>

/** An RTK Query error (from `.unwrap()` or a query's `error`). */
function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && "status" in error && "data" in error
}

/** Status + body from either an axios error (authService) or an RTK Query error. */
function parse(error: unknown): { status: ApiError["status"]; body: unknown } | null {
  if (isApiError(error)) return { status: error.status, body: error.data }
  if (isAxiosError<DrfErrorBody>(error)) {
    if (!error.response) return { status: error.code === "ECONNABORTED" ? "TIMEOUT" : "FETCH_ERROR", body: null }
    return { status: error.response.status, body: error.response.data }
  }
  return null
}

/** Turns anything thrown by an API call into a message fit for a toast. */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const parsed = parse(error)
  if (parsed) {
    if (parsed.status === "FETCH_ERROR") return "Can't reach the server."
    if (parsed.status === "TIMEOUT") return "The server took too long to respond."
    const body = parsed.body as DrfErrorBody | null
    if (typeof body === "string" || !body) return fallback // HTML error page, e.g. a 500
    if (typeof body === "object") {
      if (typeof body.detail === "string") return body.detail
      const messages = Object.values(body).flat().filter((m): m is string => typeof m === "string")
      if (messages.length) return messages.join(" ")
    }
    return fallback
  }
  if (error instanceof Error) return error.message
  return fallback
}

/** Per-field errors from a DRF 400 response, for showing under form inputs. */
export function getApiFieldErrors(error: unknown): Record<string, string> {
  const parsed = parse(error)
  if (!parsed || parsed.status !== 400 || !parsed.body || typeof parsed.body !== "object") return {}

  return Object.fromEntries(
    Object.entries(parsed.body as Record<string, unknown>)
      .filter(([key]) => key !== "detail" && key !== "non_field_errors")
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)]),
  )
}
