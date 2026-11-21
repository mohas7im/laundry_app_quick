import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"

// Mirrors branches.serializers.BranchSerializer
export interface Branch {
  id: number
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

export const branchKeys = {
  all: ["branches"] as const,
}

export function useBranches() {
  return useQuery({
    queryKey: branchKeys.all,
    queryFn: async () => (await apiClient.get<Branch[]>(ENDPOINTS.branches.list)).data,
  })
}

/** Create when `id` is undefined, otherwise update. */
export function useSaveBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: number; data: Partial<BranchInput> }) =>
      id
        ? (await apiClient.patch<Branch>(ENDPOINTS.branches.byId(id), data)).data
        : (await apiClient.post<Branch>(ENDPOINTS.branches.list, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: branchKeys.all }),
  })
}

export function useDeleteBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(ENDPOINTS.branches.byId(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: branchKeys.all }),
  })
}
