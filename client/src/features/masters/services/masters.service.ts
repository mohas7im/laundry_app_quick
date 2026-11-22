// Common masters service. Reading is open to every logged-in user; changes need the
// Common Masters permissions. Nothing is cached.
import { ENDPOINTS } from "@/lib/api/endpoints"
import { http } from "@/lib/api/http"
import type { CommonMaster, CommonMasterRequest, CommonMasterType, MasterTypeCode } from "../types"

export const getMasterTypes = () => http.get<CommonMasterType[]>(ENDPOINTS.commonMasterTypes.list)

/** The values of one list; activeOnly for form dropdowns. */
export const getMasters = (type: MasterTypeCode, activeOnly = false) =>
  http.get<CommonMaster[]>(ENDPOINTS.commonMasters.list, { params: { type, ...(activeOnly && { active: true }) } })

export const createMaster = (payload: CommonMasterRequest) =>
  http.post<CommonMaster>(ENDPOINTS.commonMasters.list, payload)

export const updateMaster = (id: string, payload: Partial<CommonMasterRequest>) =>
  http.patch<CommonMaster>(ENDPOINTS.commonMasters.byId(id), payload)

export const deleteMaster = (id: string) => http.delete(ENDPOINTS.commonMasters.byId(id))
