import { NavLink, useLocation } from "react-router"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { NavGroup, NavItem } from "@/config/navigation"
import { useAuth } from "@/lib/auth/auth-context"

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const { pathname } = useLocation()
  const { user, can } = useAuth()

  const isVisible = (item: NavItem) =>
    (!item.ownerOnly || !!user?.is_owner) && (!item.permission || can(item.permission))

  return (
    <>
      {groups.map((group, i) => {
        const items = group.items.filter(isVisible)
        if (!items.length) return null
        return (
          <SidebarGroup key={group.label ?? i}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={pathname === item.url}
                      render={<NavLink to={item.url} end />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}
