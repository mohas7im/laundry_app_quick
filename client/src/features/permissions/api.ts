import type { Role } from "@/features/roles/api"
import { baseApi } from "@/lib/api/base-api"
import { ENDPOINTS } from "@/lib/api/endpoints"

// GET /api/permissions/ — the permission grid.
export interface PermissionMatrix {
  /** The grid's columns, in order. */
  actions: { code: string; name: string }[]
  /** One row per menu, tree order. `permissions` maps action code → permission code. */
  menus: {
    id: string
    code: string
    name: string
    depth: number
    is_header: boolean
    is_sub_header: boolean
    permissions: Record<string, string>
  }[]
}

// GET/PUT /api/permissions/roles/{roleId}/
export interface RolePermissions {
  role: Role
  permissions: string[]
}

export const permissionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** The grid: action columns and menu rows (needs permissions.view). */
    getPermissionMatrix: build.query<PermissionMatrix, void>({
      query: () => ENDPOINTS.permissions.matrix,
      providesTags: ["PermissionMatrix"],
    }),
    getRolePermissions: build.query<RolePermissions, string>({
      query: (roleId) => ENDPOINTS.permissions.role(roleId),
      providesTags: (_result, _error, roleId) => [{ type: "RolePermissions", id: roleId }],
    }),
    /** Replace the role's permissions with exactly `permissions` (needs permissions.edit). */
    saveRolePermissions: build.mutation<RolePermissions, { roleId: string; permissions: string[] }>({
      query: ({ roleId, permissions }) => ({
        url: ENDPOINTS.permissions.role(roleId),
        method: "PUT",
        data: { permissions },
      }),
      // the role list shows permission counts; your own sidebar may change too
      invalidatesTags: (_result, _error, { roleId }) => [{ type: "RolePermissions", id: roleId }, "Role", "MyMenu"],
    }),
  }),
})

export const { useGetPermissionMatrixQuery, useGetRolePermissionsQuery, useSaveRolePermissionsMutation } = permissionsApi
