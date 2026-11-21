import { NavLink, useLocation } from "react-router"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"
import { useMyMenus, type MyMenu } from "@/features/menus/api"
import { menuIcon } from "@/lib/icons"

type Group = { id: string; label?: string; items: MyMenu[] }

/**
 * Sidebar groups from /api/menus/my/ (already filtered by permission, in order).
 * Top-level menus with a path form the first, unlabelled group; a top-level menu
 * without a path is a heading for the menus under it.
 */
function toGroups(menus: MyMenu[]): Group[] {
  const top: Group = { id: "top", items: [] }
  const groups: Group[] = [top]
  const headingOf = new Map<string, Group>()
  const parentOf = new Map(menus.map((m) => [m.id, m.parent]))

  const rootId = (m: MyMenu) => {
    let id = m.id
    while (parentOf.get(id)) id = parentOf.get(id)!
    return id
  }

  for (const m of menus) {
    if (m.depth === 0 && !m.path) {
      const g = { id: m.id, label: m.name, items: [] }
      headingOf.set(m.id, g)
      groups.push(g)
    } else if (m.path) {
      ;(headingOf.get(rootId(m)) ?? top).items.push(m)
    }
  }
  return groups.filter((g) => g.items.length)
}

export function NavMain() {
  const { pathname } = useLocation()
  const { data, isLoading } = useMyMenus()

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarMenu>
          {Array.from({ length: 4 }, (_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    )
  }

  return (
    <>
      {toGroups(data ?? []).map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = menuIcon(item.icon)
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      tooltip={item.name}
                      isActive={pathname === item.path}
                      render={<NavLink to={item.path} end />}
                    >
                      <Icon />
                      <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
