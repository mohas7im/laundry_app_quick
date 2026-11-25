// Dashboard, daily summary and exports of the active branch. Nothing is cached.
import { isAxiosError } from "axios"

import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { Dashboard, DailySummary, SeriesRange } from "../types"

export const getDashboard = (range: SeriesRange = "7d") =>
  http.get<Dashboard>(ENDPOINTS.dashboard, { params: { range } })

/** The end-of-day report for one shop day (YYYY-MM-DD). */
export const getDailySummary = (date: string) => http.get<DailySummary>(ENDPOINTS.reports.daily, { params: { date } })

/**
 * Download the orders taken between two days (YYYY-MM-DD) as a CSV file that opens in Excel.
 * The file comes through apiClient, so the login cookie and the refresh-on-401 still apply.
 */
export async function downloadOrdersCsv(from: string, to: string) {
  try {
    const response = await apiClient.get<Blob>(ENDPOINTS.reports.ordersCsv, {
      params: { from, to },
      responseType: "blob",
    })
    const name = /filename="([^"]+)"/.exec(String(response.headers["content-disposition"] ?? ""))?.[1]
    const url = URL.createObjectURL(response.data)
    const link = document.createElement("a")
    link.href = url
    link.download = name ?? `orders-${from}-to-${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    // an error answer arrives as a Blob: read it back as JSON so the usual error helpers work
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text())
      } catch {
        // not JSON: keep it
      }
    }
    throw err
  }
}
