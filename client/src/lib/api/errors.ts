import { isAxiosError } from "axios"

/**
 * Django REST Framework error shapes:
 *   { detail: "Authentication credentials were not provided." }
 *   { non_field_errors: ["Invalid email or password."] }
 *   { email: ["Enter a valid email address."], password: ["This field is required."] }
 */
type DrfErrorBody = string | { detail?: string } | Record<string, string[] | string>

/** Turns anything thrown by apiClient into a message fit for a toast. */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (isAxiosError<DrfErrorBody>(error)) {
    if (!error.response) {
      return error.code === "ECONNABORTED" ? "The server took too long to respond." : "Can't reach the server."
    }

    const body = error.response.data
    if (typeof body === "string") return fallback // HTML error page, e.g. a 500
    if (body && typeof body === "object") {
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
  if (!isAxiosError(error) || error.response?.status !== 400) return {}
  const body = error.response.data
  if (!body || typeof body !== "object") return {}

  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>)
      .filter(([key]) => key !== "detail" && key !== "non_field_errors")
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)]),
  )
}
