// Catalogue service: services, items, price lists, prices and upcharges.
// Each function returns the record(s) themselves (`http` unwraps the response);
// failures throw the axios error. Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type {
  ImportRequest,
  ImportResult,
  Item,
  ItemRequest,
  PriceCell,
  PriceChange,
  PriceGrid,
  PriceList,
  PriceListRequest,
  Service,
  ServiceRequest,
  Upcharge,
  UpchargeRequest,
} from "../types"

// Services
export const getServices = () => http.get<Service[]>(ENDPOINTS.services.list)
export const createService = (payload: ServiceRequest) => http.post<Service>(ENDPOINTS.services.list, payload)
export const updateService = (id: string, payload: Partial<ServiceRequest>) =>
  http.patch<Service>(ENDPOINTS.services.byId(id), payload)
export const deleteService = (id: string) => http.delete(ENDPOINTS.services.byId(id))

// Items
export const getItems = () => http.get<Item[]>(ENDPOINTS.items.list)
export const createItem = (payload: ItemRequest) => http.post<Item>(ENDPOINTS.items.list, payload)
export const updateItem = (id: string, payload: Partial<ItemRequest>) =>
  http.patch<Item>(ENDPOINTS.items.byId(id), payload)
export const deleteItem = (id: string) => http.delete(ENDPOINTS.items.byId(id))

// Price lists
export const getPriceLists = () => http.get<PriceList[]>(ENDPOINTS.priceLists.list)
export const createPriceList = (payload: PriceListRequest) =>
  http.post<PriceList>(ENDPOINTS.priceLists.list, payload)
export const updatePriceList = (id: string, payload: Partial<PriceListRequest>) =>
  http.patch<PriceList>(ENDPOINTS.priceLists.byId(id), payload)
export const deletePriceList = (id: string) => http.delete(ENDPOINTS.priceLists.byId(id))

// Prices (one price list as an items × services grid)
export const getPriceGrid = (priceListId: string) => http.get<PriceGrid>(ENDPOINTS.prices.grid(priceListId))
/** Saves the changed cells; returns the whole grid again. */
export const savePrices = (priceListId: string, prices: PriceCell[]) =>
  http.put<PriceGrid>(ENDPOINTS.prices.grid(priceListId), { prices })

/** The latest price changes of a list (newest first); item / service narrow it to one cell. */
export const getPriceHistory = (priceListId: string, filter: { item?: string; service?: string } = {}) =>
  http.get<PriceChange[]>(ENDPOINTS.prices.history(priceListId), { params: filter })

/** Preview (commit false) or import (commit true) a price list CSV. */
export const importPriceList = (payload: ImportRequest) => http.post<ImportResult>(ENDPOINTS.catalogueImport, payload)

// Upcharges
export const getUpcharges = () => http.get<Upcharge[]>(ENDPOINTS.upcharges.list)
export const createUpcharge = (payload: UpchargeRequest) => http.post<Upcharge>(ENDPOINTS.upcharges.list, payload)
export const updateUpcharge = (id: string, payload: Partial<UpchargeRequest>) =>
  http.patch<Upcharge>(ENDPOINTS.upcharges.byId(id), payload)
export const deleteUpcharge = (id: string) => http.delete(ENDPOINTS.upcharges.byId(id))
