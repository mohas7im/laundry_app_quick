// Request interceptor - runs before every request
import type { InternalAxiosRequestConfig } from "axios"
import { API_CONFIG, BRANCH_HEADER_NAME, CSRF_HEADER_NAME } from "../config"
import { ensureCsrfToken } from "../csrf"
import { getActiveBranchId } from "@/lib/auth/active-branch"

const SAFE_METHODS = ["get", "head", "options"]

export async function onRequest(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? "get").toLowerCase()

  if (!SAFE_METHODS.includes(method)) {
    const token = await ensureCsrfToken()
    if (token) config.headers.set(CSRF_HEADER_NAME, token)
  }

  const branchId = getActiveBranchId()
  if (branchId && !config.headers.has(BRANCH_HEADER_NAME)) {
    config.headers.set(BRANCH_HEADER_NAME, String(branchId))
  }

  if (API_CONFIG.logRequests) {
    console.log(`${method.toUpperCase()} ${config.url}`)
  }
  return config
}
