// Customer service: the calls to /api/customers/. Each function returns the record(s) themselves
// (`http` unwraps the response); failures throw the axios error, which
// getApiErrorMessage / getApiFieldErrors read. Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { Customer, CustomerRequest } from "../types"

export const getCustomers = () => http.get<Customer[]>(ENDPOINTS.customers.list)

export const createCustomer = (payload: CustomerRequest) => http.post<Customer>(ENDPOINTS.customers.list, payload)

export const updateCustomer = (id: string, payload: Partial<CustomerRequest>) =>
  http.patch<Customer>(ENDPOINTS.customers.byId(id), payload)

export const deleteCustomer = (id: string) => http.delete(ENDPOINTS.customers.byId(id))
