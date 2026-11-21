import { Building2Icon, CheckIcon, ChevronDownIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"

/** Top header: shows the active branch; users with several branches can switch. */
export function BranchSwitcher() {
  const { user, activeBranch, selectBranch } = useAuth()
  const branches = user?.branches ?? []

  if (!activeBranch) return null

  const label = (
    <>
      <Building2Icon data-icon="inline-start" />
      <span className="max-w-40 truncate">{activeBranch.name}</span>
    </>
  )

  // one branch: nothing to switch to, just show where you're working
  if (branches.length < 2) {
    return (
      <Button variant="outline" size="sm" className="pointer-events-none" tabIndex={-1}>
        {label}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="Switch branch" />}>
        {label}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="end" sideOffset={4}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch branch</DropdownMenuLabel>
          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onClick={() =>
                selectBranch(branch.id).then(
                  () => toast.success(`Switched to ${branch.name}`),
                  (err) => toast.error(getApiErrorMessage(err, "Couldn't switch branch.")),
                )
              }
            >
              <div className="grid flex-1 leading-tight">
                <span>
                  {branch.name} <span className="text-muted-foreground">· {branch.code}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {branch.roles.map((r) => r.name).join(", ") || "No role"}
                </span>
              </div>
              {branch.id === activeBranch.id && <CheckIcon className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
