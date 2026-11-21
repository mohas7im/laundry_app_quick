import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors roles.serializers.RoleSerializer
export interface Role {
  id: number
  name: string
  description: string
  permissions: string[]
  user_count: number
  created_at: string
  updated_at: string
}

export type RoleInput = Pick<Role, "name" | "description" | "permissions">

// GET /api/permissions/ — defined in roles/registry.py
export interface PermissionGroup {
  module: string
  permissions: { code: string; label: string }[]
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
    staleTime: Infinity, // only changes when the backend is deployed
  })
}

/** Create when `id` is undefined, otherwise update. */
export function useSaveRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: number; data: RoleInput }) =>
      id
        ? (await apiClient.patch<Role>(ENDPOINTS.roles.byId(id), data)).data
        : (await apiClient.post<Role>(ENDPOINTS.roles.list, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(ENDPOINTS.roles.byId(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  })
}
