// Response interceptor - runs after every failed response
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios"
import { ENDPOINTS } from "../endpoints"
import { redirectToLogin, refreshSession } from "@/lib/auth/session"

declare module "axios" {
  interface AxiosRequestConfig {
    /** Still try a refresh on 401, but don't redirect to /login if it fails (caller decides). */
    skipAuthRedirect?: boolean
  }
}

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// A 401 from these means "wrong password" / "session over", not "token expired".
const NO_REFRESH_URLS: string[] = [ENDPOINTS.auth.login, ENDPOINTS.auth.refresh]

/**
 * On 401, refresh the session once and replay the request through the same
 * client; if the refresh fails, send the user to the login page.
 */
export function createResponseErrorHandler(client: AxiosInstance) {
  return async (error: AxiosError) => {
    const request = error.config as RetryableConfig | undefined

    if (error.response?.status !== 401 || !request) {
      return Promise.reject(error)
    }

    if (!request._retry && !NO_REFRESH_URLS.includes(request.url ?? "")) {
      request._retry = true
      if (await refreshSession()) {
        return client(request)
      }
    }

    if (!request.skipAuthRedirect) redirectToLogin()
    return Promise.reject(error)
  }
}
