// Order service: the New Order screen and the orders of the active branch.
// Each function returns the record(s) themselves (`http` unwraps the response). Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { Order, OrderListRow, OrderRequest, PosCatalogue } from "../types"

export const getPosCatalogue = () => http.get<PosCatalogue>(ENDPOINTS.pos.catalogue)

export const getOrders = () => http.get<OrderListRow[]>(ENDPOINTS.orders.list)

export const getOrder = (id: string) => http.get<Order>(ENDPOINTS.orders.byId(id))

/** The server prices the order from the price list; its totals are the final ones. */
export const createOrder = (payload: OrderRequest) => http.post<Order>(ENDPOINTS.orders.list, payload)
