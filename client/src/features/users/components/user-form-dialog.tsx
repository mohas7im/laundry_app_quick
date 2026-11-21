import { useState } from "react"
import { Link } from "react-router"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { useBranches } from "@/features/branches/api"
import { useRoles } from "@/features/roles/api"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useSaveStaffUser, type StaffUser } from "../api"

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

// A row in the "Branches & roles" list. 0 = not chosen yet.
type Assignment = { key: number; branch: number; role: number }

let nextKey = 1

function UserForm({ user, onDone }: { user?: StaffUser | null; onDone: () => void }) {
  const save = useSaveStaffUser()
  const branches = useBranches()
  const roles = useRoles()

  const [email, setEmail] = useState(user?.email ?? "")
  const [fullName, setFullName] = useState(user?.full_name ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [password, setPassword] = useState("")
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    user?.memberships.length
      ? user.memberships.map((m) => ({ key: nextKey++, branch: m.branch, role: m.role }))
      : [{ key: nextKey++, branch: 0, role: 0 }],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const update = (key: number, patch: Partial<Assignment>) =>
    setAssignments((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const usedBranches = new Set(assignments.map((a) => a.branch))
  const branchList = branches.data ?? []
  const roleList = roles.data ?? []
  const canAddRow = assignments.length < branchList.length
  const missingSetup = !branches.isLoading && !roles.isLoading && (!branchList.length || !roleList.length)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const memberships = assignments.filter((a) => a.branch && a.role).map(({ branch, role }) => ({ branch, role }))
    if (assignments.some((a) => !a.branch || !a.role)) {
      setErrors({ memberships: "Choose a branch and a role on every row, or remove the empty row." })
      return
    }
    setErrors({})
    try {
      await save.mutateAsync({
        id: user?.id,
        data: {
          email,
          full_name: fullName,
          phone,
          is_active: isActive,
          memberships,
          ...(password ? { password } : {}),
        },
      })
      toast.success(user ? "User updated" : "User created")
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
        <DialogTitle>{user ? `Edit ${user.full_name}` : "New user"}</DialogTitle>
        <DialogDescription>Staff log in with this email and password.</DialogDescription>
      </DialogHeader>

      {missingSetup && (
        <Alert>
          <AlertDescription>
            Create at least one <Link to="/branches" className="underline" onClick={onDone}>branch</Link> and one{" "}
            <Link to="/roles" className="underline" onClick={onDone}>role</Link> before adding users.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" required error={errors.full_name}>
          {(f) => <Input {...f} value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Phone" error={errors.phone}>
          {(f) => <Input {...f} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </FormField>
        <FormField label="Email" required error={errors.email}>
          {(f) => (
            <Input {...f} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </FormField>
        <FormField
          label={user ? "New password" : "Password"}
          required={!user}
          error={errors.password}
          hint={user ? "Leave empty to keep the current password." : "At least 8 characters."}
        >
          {(f) => (
            <Input
              {...f}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-2">
        <Label>Branches & roles</Label>
        <p className="text-xs text-muted-foreground">
          The user can work in each branch listed here, with that branch's role.
        </p>

        {assignments.map((a, i) => (
          <div key={a.key} className="flex items-center gap-2">
            <NativeSelect
              className="flex-1"
              aria-label={`Branch ${i + 1}`}
              value={a.branch}
              onChange={(e) => update(a.key, { branch: Number(e.target.value) })}
            >
              <NativeSelectOption value={0}>Select branch…</NativeSelectOption>
              {branchList.map((b) => (
                <NativeSelectOption
                  key={b.id}
                  value={b.id}
                  disabled={b.id !== a.branch && usedBranches.has(b.id)}
                >
                  {b.name}
                  {!b.is_active ? " (inactive)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              className="flex-1"
              aria-label={`Role ${i + 1}`}
              value={a.role}
              onChange={(e) => update(a.key, { role: Number(e.target.value) })}
            >
              <NativeSelectOption value={0}>Select role…</NativeSelectOption>
              {roleList.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {r.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove row ${i + 1}`}
              disabled={assignments.length === 1}
              onClick={() => setAssignments((rows) => rows.filter((r) => r.key !== a.key))}
            >
              <XIcon />
            </Button>
          </div>
        ))}

        {errors.memberships && <p className="text-xs text-destructive">{errors.memberships}</p>}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={!canAddRow}
          onClick={() => setAssignments((rows) => [...rows, { key: nextKey++, branch: 0, role: 0 }])}
        >
          <PlusIcon />
          Add another branch
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="user-active">Active</Label>
        <span className="text-xs text-muted-foreground">Inactive users can't log in.</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || missingSetup}>
          {save.isPending ? "Saving…" : user ? "Save changes" : "Create user"}
        </Button>
      </DialogFooter>
    </form>
  )
}
