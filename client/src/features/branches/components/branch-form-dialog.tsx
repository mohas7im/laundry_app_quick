import { useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useSaveBranchMutation, type Branch, type BranchInput } from "../api"

const empty: BranchInput = { name: "", code: "", phone: "", email: "", address: "", is_active: true }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  branch?: Branch | null
}

export function BranchFormDialog({ open, onOpenChange, branch }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* key resets the form each time a different branch is opened */}
        {open && <BranchForm key={branch?.id ?? "new"} branch={branch} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function BranchForm({ branch, onDone }: { branch?: Branch | null; onDone: () => void }) {
  const [save, { isLoading: saving }] = useSaveBranchMutation()
  const { reload } = useAuth()
  const [values, setValues] = useState<BranchInput>(branch ? { ...branch } : empty)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof BranchInput>(key: K, value: BranchInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    try {
      await save({ id: branch?.id, data: values }).unwrap()
      await reload() // branch list in the switcher may have changed
      toast.success(branch ? "Branch updated" : "Branch created")
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
        <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
        <DialogDescription>Each branch is a shop location with its own staff.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label="Name" required error={errors.name}>
          {(f) => <Input {...f} value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Code" required error={errors.code} hint="e.g. DXB1">
          {(f) => (
            <Input
              {...f}
              value={values.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              maxLength={20}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone" error={errors.phone}>
          {(f) => <Input {...f} type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />}
        </FormField>
        <FormField label="Email" error={errors.email}>
          {(f) => <Input {...f} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />}
        </FormField>
      </div>

      <FormField label="Address" error={errors.address}>
        {(f) => <Textarea {...f} rows={2} value={values.address} onChange={(e) => set("address", e.target.value)} />}
      </FormField>

      <div className="flex items-center gap-3">
        <Switch id="branch-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label htmlFor="branch-active">Active</Label>
        <span className="text-xs text-muted-foreground">Staff can't work in inactive branches.</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {branch ? "Save changes" : "Create branch"}
        </Button>
      </DialogFooter>
    </form>
  )
}
