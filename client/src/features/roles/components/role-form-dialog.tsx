import { useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/auth-context"
import { usePermissionGroups, useSaveRole, type PermissionGroup, type Role, type RoleInput } from "../api"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: Role | null
}

export function RoleFormDialog({ open, onOpenChange, role }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
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
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
        <DialogDescription>
          Choose what people with this role can do. You choose the branches when you give the role to a user.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Role name" required error={errors.name}>
          {(f) => (
            <Input
              {...f}
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="e.g. Cashier"
              disabled={!!role?.is_system_role}
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Description" error={errors.description}>
          {(f) => (
            <Input
              {...f}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Permissions</Label>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        </div>
        {errors.permissions && <p className="text-xs text-destructive">{errors.permissions}</p>}
        {isOwnerRole && (
          <p className="text-sm text-muted-foreground">The Owner role always has every permission.</p>
        )}

        {groups.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : groups.isError ? (
          <p className="text-sm text-destructive">{getApiErrorMessage(groups.error, "Couldn't load permissions.")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.data!.map((group) => (
              <PermissionGroupCard
                key={group.module}
                group={group}
                selected={selected}
                onToggle={toggle}
                disabled={isOwnerRole}
              />
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : role ? "Save changes" : "Create role"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function PermissionGroupCard({
  group,
  selected,
  onToggle,
  disabled,
}: {
  group: PermissionGroup
  selected: Set<string>
  onToggle: (codes: string[], on: boolean) => void
  disabled?: boolean
}) {
  const codes = group.permissions.map((p) => p.code)
  const count = codes.filter((c) => selected.has(c)).length
  const all = count === codes.length
  const groupId = `perm-group-${group.module}`

  return (
    <fieldset className="rounded-lg border p-3">
      <legend className="sr-only">{group.module}</legend>
      <div className="mb-2 flex items-center gap-2 border-b pb-2">
        <Checkbox
          id={groupId}
          checked={all}
          indeterminate={count > 0 && !all}
          disabled={disabled}
          onCheckedChange={(on) => onToggle(codes, !!on)}
        />
        <Label htmlFor={groupId} className="font-medium">
          {group.module}
        </Label>
      </div>
      <div className="grid gap-2">
        {group.permissions.map((p) => {
          const id = `perm-${p.code}`
          return (
            <div key={p.code} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.has(p.code)}
                disabled={disabled}
                onCheckedChange={(on) => onToggle([p.code], !!on)}
              />
              <Label htmlFor={id} className="font-normal">
                {p.label}
              </Label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
