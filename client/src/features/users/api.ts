import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/client"
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

export const userKeys = {
  all: ["users"] as const,
}

export function useStaffUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: async () => (await apiClient.get<StaffUser[]>(ENDPOINTS.users.list)).data,
  })
}

/** Create when `id` is undefined, otherwise update. */
export function useSaveStaffUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: StaffUserInput }) =>
      id
        ? (await apiClient.patch<StaffUser>(ENDPOINTS.users.byId(id), data)).data
        : (await apiClient.post<StaffUser>(ENDPOINTS.users.list, data)).data,
    // Branch and role pages show user counts.
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeleteStaffUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(ENDPOINTS.users.byId(id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}
