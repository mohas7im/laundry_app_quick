import type { MyMenu } from "../api"

/**
 * True if `pathname` is this menu's page or a page under it:
 * /menus matches /menus, /menus/new and /menus/123/edit. The root link "/" only matches itself.
 */
export function menuMatches(menu: Pick<MyMenu, "router_link">, pathname: string): boolean {
  const link = menu.router_link
  if (!link) return false
  if (link === "/") return pathname === "/"
  return pathname === link || pathname.startsWith(`${link}/`)
}

/** The menu for `pathname`: the one with the longest matching link. */
export function findMenuForPath(menus: MyMenu[] | undefined, pathname: string): MyMenu | undefined {
  return menus
    ?.filter((m) => menuMatches(m, pathname))
    .sort((a, b) => b.router_link.length - a.router_link.length)[0]
}
