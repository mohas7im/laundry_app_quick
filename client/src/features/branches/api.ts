import { baseApi } from "@/lib/api/base-api"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors branches.serializers.BranchSerializer
export interface Branch {
  id: string
  name: string
  code: string
  phone: string
  email: string
  address: string
  is_active: boolean
  user_count: number
  created_at: string
  updated_at: string
}

export type BranchInput = Pick<Branch, "name" | "code" | "phone" | "email" | "address" | "is_active">

export const branchesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBranches: build.query<Branch[], void>({
      query: () => ENDPOINTS.branches.list,
      providesTags: ["Branch"],
    }),
    /** Create when `id` is undefined, otherwise update. */
    saveBranch: build.mutation<Branch, { id?: string; data: Partial<BranchInput> }>({
      query: ({ id, data }) =>
        id
          ? { url: ENDPOINTS.branches.byId(id), method: "PATCH", data }
          : { url: ENDPOINTS.branches.list, method: "POST", data },
      invalidatesTags: ["Branch", "MyMenu"],
    }),
    deleteBranch: build.mutation<void, string>({
      query: (id) => ({ url: ENDPOINTS.branches.byId(id), method: "DELETE" }),
      invalidatesTags: ["Branch"],
    }),
  }),
})

export const { useGetBranchesQuery, useSaveBranchMutation, useDeleteBranchMutation } = branchesApi
