import { NavLink, useLocation } from "react-router"
import { ChevronRightIcon } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { useMyMenus, type MyMenu } from "@/features/menus/api"
import { findMenuForPath } from "@/features/menus/lib/match"
import { menuIcon } from "@/lib/icons"

type Node = MyMenu & { children: Node[] }

/** /api/menus/my/ is a flat list in display order; rebuild the tree from `parent`. */
function buildTree(menus: MyMenu[]): Node[] {
  const nodes = new Map(menus.map((m) => [m.id, { ...m, children: [] as Node[] }]))
  const roots: Node[] = []
  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

const contains = (node: Node, id: string | undefined): boolean =>
  !!id && (node.id === id || node.children.some((c) => contains(c, id)))

/**
 * Sidebar from the database:
 *  - header (top level)          → a labelled section with the menus under it
 *  - sub-header, or any parent   → a collapsible submenu
 *  - anything else               → a link
 */
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

  const activeId = findMenuForPath(data, pathname)?.id
  const roots = buildTree(data ?? [])

  // Consecutive top-level items outside headers share one unlabelled section.
  const sections: { key: string; label?: string; items: Node[] }[] = []
  for (const node of roots) {
    if (node.is_header) {
      sections.push({ key: node.id, label: node.name, items: node.children })
    } else {
      const last = sections.at(-1)
      if (last && !last.label) last.items.push(node)
      else sections.push({ key: `loose-${node.id}`, items: [node] })
    }
  }

  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.key}>
          {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((node) => (
                <MenuItem key={node.id} node={node} activeId={activeId} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}

function MenuItem({ node, activeId }: { node: Node; activeId: string | undefined }) {
  const Icon = menuIcon(node.icon)

  if (!node.children.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={node.name} isActive={node.id === activeId} render={<NavLink to={node.router_link} />}>
          <Icon />
          <span>{node.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible defaultOpen={contains(node, activeId)} render={<SidebarMenuItem />} className="group/collapsible">
      <CollapsibleTrigger render={<SidebarMenuButton tooltip={node.name} />}>
        <Icon />
        <span>{node.name}</span>
        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[open]/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {/* a parent that is also a page is listed first inside its own submenu */}
          {node.router_link && <SubLink node={node} activeId={activeId} />}
          {node.children.map((child) => (
            <SubItem key={child.id} node={child} activeId={activeId} />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Inside a submenu: links; deeper levels are flattened into their links. */
function SubItem({ node, activeId }: { node: Node; activeId: string | undefined }) {
  return (
    <>
      {node.router_link && <SubLink node={node} activeId={activeId} />}
      {node.children.map((child) => (
        <SubItem key={child.id} node={child} activeId={activeId} />
      ))}
    </>
  )
}

function SubLink({ node, activeId }: { node: Node; activeId: string | undefined }) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={node.id === activeId} render={<NavLink to={node.router_link} />}>
        <span>{node.name}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}
