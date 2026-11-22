// Order service: the New Order screen and the orders of the active branch.
// Each function returns the record(s) themselves (`http` unwraps the response). Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { MoveTarget, Order, OrderListRow, OrderRequest, PosCatalogue, ProductionBoard } from "../types"

export const getPosCatalogue = () => http.get<PosCatalogue>(ENDPOINTS.pos.catalogue)

export const getOrders = () => http.get<OrderListRow[]>(ENDPOINTS.orders.list)

export const getOrder = (id: string) => http.get<Order>(ENDPOINTS.orders.byId(id))

/** The server prices the order from the price list; its totals are the final ones. */
export const createOrder = (payload: OrderRequest) => http.post<Order>(ENDPOINTS.orders.list, payload)

// ── production board ──
export const getProductionBoard = () => http.get<ProductionBoard>(ENDPOINTS.production.board)

/** Move orders to a column; rack is kept when they go to Ready. Returns the moved orders. */
export const moveOrders = (orderIds: string[], to: MoveTarget, rack = "") =>
  http.post<OrderListRow[]>(ENDPOINTS.production.move, { orders: orderIds, to, rack })

// ── collection ──
/** Ready orders of the active branch; search by order number, name or phone. */
export const getReadyOrders = (searchTerm = "") =>
  http.get<OrderListRow[]>(ENDPOINTS.collection.list, { params: searchTerm ? { search_term: searchTerm } : {} })

/**
 * Hand back one customer's ready orders. With a balance due: cash / card / bank
 * (amount = the whole balance) or on_account (amount 0).
 */
export const collectOrders = (orderIds: string[], paymentMethod: string, amount: string) =>
  http.post<OrderListRow[]>(ENDPOINTS.collection.collect, {
    orders: orderIds,
    payment_method: paymentMethod,
    amount,
  })
