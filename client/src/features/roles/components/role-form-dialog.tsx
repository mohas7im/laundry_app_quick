import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/auth-context"
import { usePermissionGroups, useSaveRole, type PermissionGroup, type Role, type RoleInput } from "../api"

const COLUMNS = ["view", "create", "edit", "delete"] as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: Role | null
}

export function RoleFormDialog({ open, onOpenChange, role }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {open && <RoleForm key={role?.id ?? "new"} role={role} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function RoleForm({ role, onDone }: { role?: Role | null; onDone: () => void }) {
  const save = useSaveRole()
  const groups = usePermissionGroups()
  const { reload } = useAuth()
  const [values, setValues] = useState<RoleInput>({
    name: role?.name ?? "",
    description: role?.description ?? "",
    permissions: role?.permissions ?? [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Built-in Owner role: always every permission, read-only here.
  const isOwnerRole = !!role?.is_system_role && role.name === "Owner"
  const allCodes = groups.data?.flatMap((g) => g.permissions.map((p) => p.code)) ?? []
  const selected = new Set(isOwnerRole ? allCodes : values.permissions)

  function toggle(codes: string[], on: boolean) {
    const next = new Set(values.permissions)
    for (const code of codes) {
      if (on) next.add(code)
      else next.delete(code)
    }
    setValues((v) => ({ ...v, permissions: [...next] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    try {
      // Built-in roles keep their name; the Owner role keeps every permission.
      const data = isOwnerRole
        ? { description: values.description }
        : role?.is_system_role
          ? { description: values.description, permissions: values.permissions }
          : values
      await save.mutateAsync({ id: role?.id, data })
      await reload()
      toast.success(role ? "Role updated" : "Role created")
      onDone()
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>
            Tick what people with this role can do on each menu. You choose the branches when you give the role to a
            user.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor="role-name">Role name</FieldLabel>
            <Input
              id="role-name"
              placeholder="e.g. Cashier"
              autoFocus
              disabled={!!role?.is_system_role}
              value={values.name}
              aria-invalid={!!errors.name || undefined}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.description || undefined}>
            <FieldLabel htmlFor="role-description">Description</FieldLabel>
            <Input
              id="role-description"
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
            {errors.description && <FieldError>{errors.description}</FieldError>}
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">
            Permissions <span className="font-normal text-muted-foreground">· {selected.size} selected</span>
          </FieldLegend>
          {isOwnerRole && <FieldDescription>The Owner role always has every permission.</FieldDescription>}
          {errors.permissions && <FieldError>{errors.permissions}</FieldError>}

          {groups.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : groups.isError ? (
            <FieldError>{getApiErrorMessage(groups.error, "Couldn't load permissions.")}</FieldError>
          ) : (
            <PermissionMatrix groups={groups.data!} selected={selected} onToggle={toggle} disabled={isOwnerRole} />
          )}
        </FieldSet>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : role ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

/** Menus × actions grid. Headings (menus without actions) appear as section rows. */
function PermissionMatrix({
  groups,
  selected,
  onToggle,
  disabled,
}: {
  groups: PermissionGroup[]
  selected: Set<string>
  onToggle: (codes: string[], on: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Menu</TableHead>
            {COLUMNS.map((c) => (
              <TableHead key={c} className="w-20 text-center capitalize">
                {c}
              </TableHead>
            ))}
            <TableHead>Other</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(({ menu, permissions }) => {
            const indent = { paddingLeft: `${0.5 + menu.depth * 1.25}rem` }
            if (!permissions.length) {
              return (
                <TableRow key={menu.id} className="hover:bg-transparent">
                  <TableCell
                    colSpan={COLUMNS.length + 2}
                    style={indent}
                    className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {menu.name}
                  </TableCell>
                </TableRow>
              )
            }
            const codes = permissions.map((p) => p.code)
            const count = codes.filter((c) => selected.has(c)).length
            const byAction = new Map(permissions.map((p) => [p.action, p]))
            const others = permissions.filter((p) => !(COLUMNS as readonly string[]).includes(p.action))
            const rowId = `perm-row-${menu.code}`
            return (
              <TableRow key={menu.id}>
                <TableCell style={indent}>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={rowId}
                      aria-label={`All actions on ${menu.name}`}
                      checked={count === codes.length}
                      indeterminate={count > 0 && count < codes.length}
                      disabled={disabled}
                      onCheckedChange={(on) => onToggle(codes, !!on)}
                    />
                    <label htmlFor={rowId} className={menu.is_active ? "font-medium" : "text-muted-foreground"}>
                      {menu.name}
                    </label>
                  </div>
                </TableCell>
                {COLUMNS.map((action) => {
                  const p = byAction.get(action)
                  return (
                    <TableCell key={action} className="text-center">
                      {p ? (
                        <Checkbox
                          aria-label={`${p.label} ${menu.name}`}
                          checked={selected.has(p.code)}
                          disabled={disabled}
                          onCheckedChange={(on) => onToggle([p.code], !!on)}
                        />
                      ) : (
                        <span className="text-muted-foreground/50" aria-hidden="true">
                          —
                        </span>
                      )}
                    </TableCell>
                  )
                })}
                <TableCell>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {others.map((p) => (
                      <Field key={p.code} orientation="horizontal" className="w-auto gap-1.5">
                        <Checkbox
                          id={`perm-${p.code}`}
                          checked={selected.has(p.code)}
                          disabled={disabled}
                          onCheckedChange={(on) => onToggle([p.code], !!on)}
                        />
                        <FieldLabel htmlFor={`perm-${p.code}`} className="font-normal">
                          {p.label}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
