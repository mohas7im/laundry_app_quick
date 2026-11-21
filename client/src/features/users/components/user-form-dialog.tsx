import { useState } from "react"
import { Link } from "react-router"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/select-field"
import { Switch } from "@/components/ui/switch"
import { useGetBranchesQuery } from "@/features/branches/api"
import { OWNER_ROLE, useGetRolesQuery } from "@/features/roles/api"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useSaveStaffUserMutation, type StaffUser } from "../api"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: StaffUser | null
}

export function UserFormDialog({ open, onOpenChange, user }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {open && <UserForm key={user?.id ?? "new"} user={user} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const ALL_BRANCHES = "all"

// One row of the Roles list: a role and where it applies ("" = not chosen yet).
type RoleRow = { key: number; role: string; scope: string }

let nextKey = 1
const emptyRow = (): RoleRow => ({ key: nextKey++, role: "", scope: "" })

function UserForm({ user, onDone }: { user?: StaffUser | null; onDone: () => void }) {
  const [save, { isLoading: saving }] = useSaveStaffUserMutation()
  const branches = useGetBranchesQuery()
  const roles = useGetRolesQuery()
  const { user: me } = useAuth()

  const [email, setEmail] = useState(user?.email ?? "")
  const [fullName, setFullName] = useState(user?.full_name ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [password, setPassword] = useState("")
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [rows, setRows] = useState<RoleRow[]>(() =>
    user?.roles.length
      ? user.roles.map((r) => ({ key: nextKey++, role: r.role, scope: r.branch ?? ALL_BRANCHES }))
      : [emptyRow()],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const branchList = branches.data ?? []
  // Only an owner may give the Owner role.
  const roleList = (roles.data ?? []).filter((r) => me?.is_owner || r.name !== OWNER_ROLE)
  const ownerRoleId = roles.data?.find((r) => r.name === OWNER_ROLE)?.id
  const noRoles = !roles.isLoading && !roleList.length

  const update = (key: number, patch: Partial<RoleRow>) =>
    setRows((list) =>
      list.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        // The Owner role always applies to all branches.
        return next.role === ownerRoleId ? { ...next, scope: ALL_BRANCHES } : next
      }),
    )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rows.some((r) => !r.role || !r.scope)) {
      setErrors({ roles: "Choose a role and where it applies on every row, or remove the empty row." })
      return
    }
    setErrors({})
    try {
      await save({
        id: user?.id,
        data: {
          email,
          full_name: fullName,
          phone,
          is_active: isActive,
          roles: rows.map((r) => ({ role: r.role, branch: r.scope === ALL_BRANCHES ? null : r.scope })),
          ...(password ? { password } : {}),
        },
      }).unwrap()
      toast.success(user ? "User updated" : "User created")
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
          <DialogTitle>{user ? `Edit ${user.full_name}` : "New user"}</DialogTitle>
          <DialogDescription>Staff log in with this email and password.</DialogDescription>
        </DialogHeader>

        {noRoles && (
          <Alert>
            <AlertDescription>
              Create a role on the{" "}
              <Link to="/roles" className="underline" onClick={onDone}>
                Roles &amp; Permissions
              </Link>{" "}
              page before adding users.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.full_name || undefined}>
            <FieldLabel htmlFor="user-name">Full name</FieldLabel>
            <Input id="user-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus
              aria-invalid={!!errors.full_name || undefined} />
            {errors.full_name && <FieldError>{errors.full_name}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.phone || undefined}>
            <FieldLabel htmlFor="user-phone">Phone</FieldLabel>
            <Input id="user-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!errors.phone || undefined} />
            {errors.phone && <FieldError>{errors.phone}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.email || undefined}>
            <FieldLabel htmlFor="user-email">Email</FieldLabel>
            <Input id="user-email" type="email" autoComplete="off" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email || undefined} />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.password || undefined}>
            <FieldLabel htmlFor="user-password">{user ? "New password" : "Password"}</FieldLabel>
            <Input id="user-password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password || undefined} />
            {errors.password ? (
              <FieldError>{errors.password}</FieldError>
            ) : (
              <FieldDescription>
                {user ? "Leave empty to keep the current password." : "At least 8 characters."}
              </FieldDescription>
            )}
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">Roles</FieldLegend>
          <FieldDescription>
            A role for <strong>All branches</strong> applies everywhere. A role for one branch applies only there.
          </FieldDescription>

          {rows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <SelectField
                className="flex-1"
                aria-label={`Role ${i + 1}`}
                placeholder="Select role…"
                value={row.role || null}
                onValueChange={(v) => update(row.key, { role: v ?? "" })}
                options={roleList.map((r) => ({ value: r.id, label: r.name }))}
              />
              <SelectField
                className="flex-1"
                aria-label={`Where role ${i + 1} applies`}
                placeholder="Select where…"
                value={row.scope || null}
                disabled={row.role === ownerRoleId}
                onValueChange={(v) => update(row.key, { scope: v ?? "" })}
                options={[
                  { value: ALL_BRANCHES, label: "All branches" },
                  ...branchList.map((b) => ({ value: b.id, label: b.is_active ? b.name : `${b.name} (inactive)` })),
                ]}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove row ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              >
                <XIcon />
              </Button>
            </div>
          ))}

          {errors.roles && <FieldError>{errors.roles}</FieldError>}

          <Button type="button" variant="outline" size="sm" className="w-fit"
            onClick={() => setRows((list) => [...list, emptyRow()])}>
            <PlusIcon data-icon="inline-start" />
            Add role
          </Button>
        </FieldSet>

        <Field orientation="horizontal">
          <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} />
          <FieldLabel htmlFor="user-active">Active</FieldLabel>
          <FieldDescription>Inactive users can't log in.</FieldDescription>
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || noRoles}>
            {saving && <Spinner data-icon="inline-start" />}
            {user ? "Save changes" : "Create user"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
