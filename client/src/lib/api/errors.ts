import { isAxiosError } from "axios"

import type { QueryError } from "./base-api"

/** The failed response body the backend sends: { success: false, message, errors: [...] }. */
type ErrorBody = {
  message: string
  errors: { error_code: string; description: string; field_name: string | null }[]
}

/** True when the body is our API's response (not e.g. an HTML 500 page). */
function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null && "success" in value && "errors" in value
}

/** An RTK Query error (from `.unwrap()` or a query's `error`). */
function isQueryError(error: unknown): error is QueryError {
  return typeof error === "object" && error !== null && "status" in error && "data" in error
}

/** Status + body from either an axios error (auth calls) or an RTK Query error. */
function parse(error: unknown): { status: QueryError["status"]; body: unknown } | null {
  if (isQueryError(error)) return { status: error.status, body: error.data }
  if (isAxiosError(error)) {
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
    if (isErrorBody(parsed.body)) return parsed.body.message || parsed.body.errors[0]?.description || fallback
    return fallback // not our API (e.g. an HTML error page from a 500)
  }
  if (error instanceof Error) return error.message
  return fallback
}

/**
 * Per-field errors from a failed result, keyed by the form field
 * ("roles[0].role" → "roles"), for showing under form inputs.
 */
export function getApiFieldErrors(error: unknown): Record<string, string> {
  const parsed = parse(error)
  if (!parsed || !isErrorBody(parsed.body)) return {}

  const fields: Record<string, string> = {}
  for (const e of parsed.body.errors) {
    if (!e.field_name) continue
    const field = e.field_name.split(/[.[]/)[0]!
    fields[field] = fields[field] ? `${fields[field]} ${e.description}` : e.description
  }
  return fields
}
