// Company settings: everyone logged in can read them (receipts print them); saving needs company.edit.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { CompanySettings, CompanySettingsRequest } from "../types"

export const getCompanySettings = () => http.get<CompanySettings>(ENDPOINTS.company)

export const saveCompanySettings = (payload: CompanySettingsRequest) =>
  http.put<CompanySettings>(ENDPOINTS.company, payload)
