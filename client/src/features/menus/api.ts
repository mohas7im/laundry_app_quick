import { baseApi } from "@/lib/api/base-api"
import { ENDPOINTS } from "@/lib/api/endpoints"
import { useAuth } from "@/lib/auth/use-auth"

// Mirrors roles.serializers.MenuSerializer (the list adds `depth`).
export interface Menu {
  id: string
  name: string
  code: string
  router_name: string
  router_description: string
  /** The page's path, e.g. /orders. Optional for headers and sub-headers. */
  router_link: string
  icon: string
  parent: string | null
  /** Shown as a section header in the sidebar (groups the menus under it). */
  is_header: boolean
  /** Shown as a collapsible submenu in the sidebar (groups the menus under it). */
  is_sub_header: boolean
  /** "Sequence": lower comes first. */
  sort_order: number
  is_active: boolean
  /** Built-in page: name, icon, parent and order can change; structure can't. */
  is_system: boolean
  depth?: number
  created_at: string
}

export type MenuInput = Omit<Menu, "id" | "is_system" | "depth" | "created_at">

/** GET /api/menus/my/ — the sidebar for the current user, in display order. */
export interface MyMenu {
  id: string
  code: string
  name: string
  icon: string
  parent: string | null
  depth: number
  is_header: boolean
  is_sub_header: boolean
  router_link: string
}

export const menusApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Every menu, tree order (Menus page; needs menus.view). */
    getMenus: build.query<Menu[], void>({
      query: () => ENDPOINTS.menus.list,
      providesTags: ["Menu"],
    }),
    getMenu: build.query<Menu, string>({
      query: (id) => ENDPOINTS.menus.byId(id),
      providesTags: (_result, _error, id) => [{ type: "Menu", id }],
    }),
    /**
     * The sidebar: only the menus the user may see, filtered on the server.
     * The arg is the active branch, so each branch has its own cache entry.
     */
    getMyMenus: build.query<MyMenu[], string>({
      query: () => ENDPOINTS.menus.my,
      providesTags: ["MyMenu"],
    }),
    /** Create when `id` is undefined, otherwise update. */
    saveMenu: build.mutation<Menu, { id?: string; data: Partial<MenuInput> }>({
      query: ({ id, data }) =>
        id
          ? { url: ENDPOINTS.menus.byId(id), method: "PATCH", data }
          : { url: ENDPOINTS.menus.list, method: "POST", data },
      // the sidebar and the permission grid are built from menus
      invalidatesTags: ["Menu", "MyMenu", "PermissionMatrix", "Role"],
    }),
    deleteMenu: build.mutation<void, string>({
      query: (id) => ({ url: ENDPOINTS.menus.byId(id), method: "DELETE" }),
      invalidatesTags: ["Menu", "MyMenu", "PermissionMatrix", "Role"],
    }),
  }),
})

export const {
  useGetMenusQuery,
  useGetMenuQuery,
  useSaveMenuMutation,
  useDeleteMenuMutation,
} = menusApi

/** The sidebar menus for the active branch (cached; refetched when a tag is invalidated). */
export function useMyMenus() {
  const { user } = useAuth()
  return menusApi.useGetMyMenusQuery(user?.active_branch_id ?? "none", { skip: !user })
}
