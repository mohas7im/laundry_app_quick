import { Building2Icon, CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-context"

/** Shows the active branch; lets users with several branches switch. */
export function BranchSwitcher() {
  const { user, activeBranch, selectBranch } = useAuth()
  const { isMobile } = useSidebar()
  const branches = user?.branches ?? []

  if (!activeBranch) return null

  const summary = (
    <>
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2Icon className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{activeBranch.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {activeBranch.role?.name ?? "Owner"} · {activeBranch.code}
        </span>
      </div>
    </>
  )

  if (branches.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {summary}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            {summary}
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch branch</DropdownMenuLabel>
              {branches.map((branch) => (
                <DropdownMenuItem key={branch.id} onClick={() => selectBranch(branch.id)}>
                  <div className="grid flex-1 leading-tight">
                    <span>{branch.name}</span>
                    <span className="text-xs text-muted-foreground">{branch.role?.name ?? "Owner"}</span>
                  </div>
                  {branch.id === activeBranch.id && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
