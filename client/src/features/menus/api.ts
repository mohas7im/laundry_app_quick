import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"
import { useAuth } from "@/lib/auth/auth-context"

// Mirrors roles.serializers.MenuSerializer (list adds `depth`).
export interface Menu {
  id: string
  code: string
  name: string
  /** "" = group heading for the menus under it */
  path: string
  icon: string
  parent: string | null
  sort_order: number
  is_active: boolean
  /** Built-in page: can be renamed/reordered, not deleted. */
  is_system: boolean
  /** Each action is the permission "<code>.<action>". */
  actions: string[]
  depth: number
  created_at: string
}

export type MenuInput = Pick<Menu, "code" | "name" | "path" | "icon" | "parent" | "sort_order" | "is_active" | "actions">

/** GET /api/menus/my/ — the sidebar for the current user, in display order. */
export interface MyMenu {
  id: string
  code: string
  name: string
  path: string
  icon: string
  parent: string | null
  depth: number
}

export const menuKeys = {
  all: ["menus"] as const,
  my: (branchId: string | null | undefined) => ["menus", "my", branchId ?? "none"] as const,
}

export function useMenus() {
  return useQuery({
    queryKey: menuKeys.all,
    queryFn: async () => (await apiClient.get<Menu[]>(ENDPOINTS.menus.list)).data,
  })
}

/** Visible menus depend on the active branch's permissions, so the branch is part of the key. */
export function useMyMenus() {
  const { user } = useAuth()
  return useQuery({
    queryKey: menuKeys.my(user?.active_branch_id),
    queryFn: async () => (await apiClient.get<MyMenu[]>(ENDPOINTS.menus.my)).data,
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}

/** Create when `id` is undefined, otherwise update. */
export function useSaveMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Partial<MenuInput> }) =>
      id
        ? (await apiClient.patch<Menu>(ENDPOINTS.menus.byId(id), data)).data
        : (await apiClient.post<Menu>(ENDPOINTS.menus.list, data)).data,
    // sidebar, permission grid and role lists all depend on menus
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeleteMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(ENDPOINTS.menus.byId(id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}
