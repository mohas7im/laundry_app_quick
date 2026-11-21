import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors accounts.serializers.MembershipSerializer / StaffUserSerializer
export interface Membership {
  id: number
  branch: number
  branch_name: string
  role: number
  role_name: string
}

export interface StaffUser {
  id: number
  email: string
  full_name: string
  phone: string
  is_active: boolean
  memberships: Membership[]
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
  memberships: { branch: number; role: number }[]
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
    mutationFn: async ({ id, data }: { id?: number; data: StaffUserInput }) =>
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
    mutationFn: (id: number) => apiClient.delete(ENDPOINTS.users.byId(id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}
