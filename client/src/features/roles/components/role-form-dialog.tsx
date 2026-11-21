import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useSaveRoleMutation, type Role, type RoleInput } from "../api"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: Role | null
}

/** Name and description. Permissions are set on the role's Permissions page. */
export function RoleFormDialog({ open, onOpenChange, role }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <RoleForm key={role?.id ?? "new"} role={role} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function RoleForm({ role, onDone }: { role?: Role | null; onDone: () => void }) {
  const navigate = useNavigate()
  const [save, { isLoading: saving }] = useSaveRoleMutation()
  const [values, setValues] = useState<RoleInput>({ name: role?.name ?? "", description: role?.description ?? "" })
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    try {
      // Built-in roles keep their name.
      const data = role?.is_system_role ? { description: values.description } : values
      const saved = await save({ id: role?.id, data }).unwrap()
      onDone()
      if (role) {
        toast.success("Role updated")
      } else {
        toast.success("Role created — now choose its permissions")
        navigate(`/permissions/${saved.id}`)
      }
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
            {role ? "Change the name or description." : "After creating it you'll choose its permissions."}
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : role ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
