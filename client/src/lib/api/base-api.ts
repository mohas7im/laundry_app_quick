// The single RTK Query API slice. Features add their endpoints with `baseApi.injectEndpoints`.
import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react"
import { isAxiosError, type AxiosRequestConfig } from "axios"

import { apiClient } from "./client"

export type ApiRequest = {
  url: string
  method?: AxiosRequestConfig["method"]
  data?: unknown
  params?: AxiosRequestConfig["params"]
}

/**
 * RTK Query error: HTTP status (or "FETCH_ERROR" when the server can't be reached)
 * and the response body ({ success, message, data, errors, referenced_tables }).
 */
export type QueryError = { status: number | "FETCH_ERROR" | "TIMEOUT"; data: unknown }

/**
 * Runs every request through `apiClient`, so the CSRF header and the
 * refresh-on-401 interceptor apply to RTK Query calls too.
 * Every response is wrapped as { success, message, data, ... }; queries and mutations get its `data`.
 */
const axiosBaseQuery: BaseQueryFn<ApiRequest | string, unknown, QueryError> = async (args) => {
  const { url, method = "GET", data, params } = typeof args === "string" ? { url: args } : args
  try {
    const response = await apiClient.request<{ data: unknown }>({ url, method, data, params })
    return { data: response.data.data }
  } catch (err) {
    if (isAxiosError(err)) {
      if (!err.response) {
        return { error: { status: err.code === "ECONNABORTED" ? "TIMEOUT" : "FETCH_ERROR", data: null } }
      }
      return { error: { status: err.response.status, data: err.response.data } }
    }
    return { error: { status: "FETCH_ERROR", data: null } }
  }
}

/**
 * Cache tags. A query "provides" tags; a mutation "invalidates" them, and every
 * query holding an invalidated tag refetches.
 */
export const TAGS = ["Branch", "Role", "User", "Menu", "MyMenu", "PermissionMatrix", "RolePermissions"] as const

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery,
  tagTypes: TAGS,
  // server data is shared; keep unused results 5 minutes, refetch only when a tag is invalidated
  keepUnusedDataFor: 300,
  refetchOnFocus: false,
  endpoints: () => ({}),
})
