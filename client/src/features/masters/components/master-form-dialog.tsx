import { useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
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
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { createMaster, updateMaster } from "../services/masters.service"
import type { CommonMaster, CommonMasterType } from "../types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: CommonMasterType
  master?: CommonMaster | null
  onSaved: () => void
}

export function MasterFormDialog({ open, onOpenChange, type, master, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <MasterForm key={master?.id ?? "new"} type={type} master={master} onSaved={onSaved} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MasterForm({
  type,
  master,
  onSaved,
  onDone,
}: {
  type: CommonMasterType
  master?: CommonMaster | null
  onSaved: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(master?.name ?? "")
  const [sortOrder, setSortOrder] = useState(master?.sort_order ?? 0)
  const [isActive, setIsActive] = useState(master?.is_active ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrors({})
    try {
      const values = { name, sort_order: sortOrder, is_active: isActive }
      if (master) await updateMaster(master.id, values)
      else await createMaster({ type: type.code, ...values })
      toast.success(master ? "Value updated" : "Value added")
      onSaved()
      onDone()
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{master ? `Edit ${master.name}` : `New ${type.name.toLowerCase()}`}</DialogTitle>
        <DialogDescription>{type.description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <FormField label="Name" required error={errors.name ?? errors.code ?? errors.type}>
          {(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Sequence" error={errors.sort_order} hint="Lower first.">
          {(f) => (
            <Input
              {...f}
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Math.max(0, Number(e.target.value) || 0))}
            />
          )}
        </FormField>
      </div>

      {master && (
        <p className="text-xs text-muted-foreground">
          Code <span className="font-mono">{master.code}</span> stays the same: other records use it.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Switch id="master-active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="master-active">Active</Label>
        <span className="text-xs text-muted-foreground">Inactive values are hidden from forms.</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {master ? "Save changes" : "Add value"}
        </Button>
      </DialogFooter>
    </form>
  )
}
