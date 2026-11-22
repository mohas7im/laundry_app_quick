// Customer service: the calls to /api/customers/. Each function returns the record(s) themselves
// (`http` unwraps the response); failures throw the axios error, which
// getApiErrorMessage / getApiFieldErrors read. Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { Page } from "@/lib/api/http"
import type { Customer, CustomerRequest } from "../types"

export const getCustomers = () => http.get<Customer[]>(ENDPOINTS.customers.list)

/** Counter search: name, phone (the last digits are enough) or email; the best few matches. */
export const searchCustomers = (term: string, pageSize = 8) =>
  http
    .get<Page<Customer>>(ENDPOINTS.customers.list, { params: { search_term: term, page_number: 1, page_size: pageSize } })
    .then((page) => page.items)

export const createCustomer = (payload: CustomerRequest) => http.post<Customer>(ENDPOINTS.customers.list, payload)

export const updateCustomer = (id: string, payload: Partial<CustomerRequest>) =>
  http.patch<Customer>(ENDPOINTS.customers.byId(id), payload)

export const deleteCustomer = (id: string) => http.delete(ENDPOINTS.customers.byId(id))
