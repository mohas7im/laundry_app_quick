import { baseApi } from "@/lib/api/base-api"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors accounts.serializers.UserRoleSerializer: one row of user_roles.
export interface UserRoleRow {
  id: string
  role: string
  role_name: string
  /** null = organization-wide (all branches) */
  branch: string | null
  branch_name: string | null
}

// Mirrors accounts.serializers.StaffUserSerializer
export interface StaffUser {
  id: string
  email: string
  full_name: string
  phone: string
  is_active: boolean
  is_owner: boolean
  roles: UserRoleRow[]
  date_joined: string
  last_login: string | null
}

export interface StaffUserInput {
  email: string
  full_name: string
  phone: string
  is_active: boolean
  /** Required when creating; leave empty when editing to keep the current one. */
  password?: string
  /** branch null = organization-wide. Branch assignments are derived from these. */
  roles: { role: string; branch: string | null }[]
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getStaffUsers: build.query<StaffUser[], void>({
      query: () => ENDPOINTS.users.list,
      providesTags: ["User"],
    }),
    /** Create when `id` is undefined, otherwise update. */
    saveStaffUser: build.mutation<StaffUser, { id?: string; data: StaffUserInput }>({
      query: ({ id, data }) =>
        id
          ? { url: ENDPOINTS.users.byId(id), method: "PATCH", data }
          : { url: ENDPOINTS.users.list, method: "POST", data },
      // branch and role lists show user counts
      invalidatesTags: ["User", "Branch", "Role"],
    }),
    deleteStaffUser: build.mutation<void, string>({
      query: (id) => ({ url: ENDPOINTS.users.byId(id), method: "DELETE" }),
      invalidatesTags: ["User", "Branch", "Role"],
    }),
  }),
})

export const { useGetStaffUsersQuery, useSaveStaffUserMutation, useDeleteStaffUserMutation } = usersApi
