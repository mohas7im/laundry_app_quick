// Typed helpers over apiClient that return just the response's `data`.
//
// Django wraps every response as { success, message, data, errors, referenced_tables },
// and axios puts that body in `response.data`, so the record would be
// `response.data.data`. These helpers unwrap it once, here:
//
//   const customers = await http.get<Customer[]>(ENDPOINTS.customers.list)
//
// Failures still throw the axios error (getApiErrorMessage / getApiFieldErrors read it).
// Need the whole body (e.g. `message`)? Call apiClient directly.
import type { AxiosRequestConfig, AxiosResponse } from "axios"

import { apiClient } from "./client"

/** A page from a list API asked with page_number / page_size (common/pagination.py). */
export type Page<TItem> = {
  items: TItem[]
  page_number: number
  page_size: number
  total_count: number
  total_pages: number
}

type Body<TData> = { success: boolean; message: string; data: TData }

const unwrap = <TData>(response: AxiosResponse<Body<TData>>) => response.data.data

export const http = {
  get: <TData>(url: string, config?: AxiosRequestConfig) =>
    apiClient.get<Body<TData>>(url, config).then(unwrap),

  post: <TData>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    apiClient.post<Body<TData>>(url, body, config).then(unwrap),

  put: <TData>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    apiClient.put<Body<TData>>(url, body, config).then(unwrap),

  patch: <TData>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    apiClient.patch<Body<TData>>(url, body, config).then(unwrap),

  delete: <TData = null>(url: string, config?: AxiosRequestConfig) =>
    apiClient.delete<Body<TData>>(url, config).then(unwrap),
}
