import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors roles.serializers.RoleSerializer
export interface Role {
  id: string
  name: string
  description: string
  /** Built in (the Owner role): can't be renamed or deleted. */
  is_system_role: boolean
  permissions: string[]
  user_count: number
  created_at: string
}

export type RoleInput = Pick<Role, "name" | "description" | "permissions">

// GET /api/permissions/ — one row per menu (tree order) with that menu's permissions.
export interface PermissionGroup {
  menu: { id: string; code: string; name: string; depth: number; is_active: boolean }
  permissions: { code: string; action: string; label: string }[]
}

export const roleKeys = {
  all: ["roles"] as const,
  permissions: ["permissions"] as const,
}

export function useRoles() {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: async () => (await apiClient.get<Role[]>(ENDPOINTS.roles.list)).data,
  })
}

export function usePermissionGroups() {
  return useQuery({
    queryKey: roleKeys.permissions,
    queryFn: async () => (await apiClient.get<PermissionGroup[]>(ENDPOINTS.permissions)).data,
    // changes when menus change (useSaveMenu invalidates every query)
  })
}

/** Create when `id` is undefined, otherwise update. */
export function useSaveRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Partial<RoleInput> }) =>
      id
        ? (await apiClient.patch<Role>(ENDPOINTS.roles.byId(id), data)).data
        : (await apiClient.post<Role>(ENDPOINTS.roles.list, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(ENDPOINTS.roles.byId(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  })
}
