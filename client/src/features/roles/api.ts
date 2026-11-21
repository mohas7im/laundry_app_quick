import { baseApi } from "@/lib/api/base-api"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors roles.serializers.RoleSerializer
/** The owner role is found by its name; it can't be renamed or deleted. */
export const OWNER_ROLE = "Owner"

export interface Role {
  id: string
  name: string
  description: string
  permission_count: number
  user_count: number
  created_at: string
}

export type RoleInput = Pick<Role, "name" | "description">

export const rolesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRoles: build.query<Role[], void>({
      query: () => ENDPOINTS.roles.list,
      providesTags: ["Role"],
    }),
    /** Create when `id` is undefined, otherwise update. */
    saveRole: build.mutation<Role, { id?: string; data: Partial<RoleInput> }>({
      query: ({ id, data }) =>
        id
          ? { url: ENDPOINTS.roles.byId(id), method: "PATCH", data }
          : { url: ENDPOINTS.roles.list, method: "POST", data },
      invalidatesTags: ["Role"],
    }),
    deleteRole: build.mutation<void, string>({
      query: (id) => ({ url: ENDPOINTS.roles.byId(id), method: "DELETE" }),
      invalidatesTags: ["Role"],
    }),
  }),
})

export const { useGetRolesQuery, useSaveRoleMutation, useDeleteRoleMutation } = rolesApi
