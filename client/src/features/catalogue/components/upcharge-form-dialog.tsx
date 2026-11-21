import { useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
import { SelectField } from "@/components/select-field"
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
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { createUpcharge, updateUpcharge } from "../services/catalogue.service"
import type { ChargeType, Upcharge, UpchargeRequest } from "../types"

const CHARGE_TYPE_OPTIONS = [
  { value: "fixed", label: "Fixed amount (AED)" },
  { value: "percent", label: "Percent of the line (%)" },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  upcharge?: Upcharge | null
  onSaved: () => void
}

export function UpchargeFormDialog({ open, onOpenChange, upcharge, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <UpchargeForm key={upcharge?.id ?? "new"} upcharge={upcharge} onSaved={onSaved} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function UpchargeForm({ upcharge, onSaved, onDone }: { upcharge?: Upcharge | null; onSaved: () => void; onDone: () => void }) {
  const [values, setValues] = useState<UpchargeRequest>(() =>
    upcharge
      ? {
          name: upcharge.name,
          charge_type: upcharge.charge_type,
          amount: upcharge.amount,
          sort_order: upcharge.sort_order,
          is_active: upcharge.is_active,
        }
      : { name: "", charge_type: "fixed", amount: "", sort_order: 0, is_active: true },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof UpchargeRequest>(key: K, value: UpchargeRequest[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrors({})
    try {
      if (upcharge) await updateUpcharge(upcharge.id, values)
      else await createUpcharge(values)
      toast.success(upcharge ? "Upcharge updated" : "Upcharge added")
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
        <DialogTitle>{upcharge ? "Edit upcharge" : "New upcharge"}</DialogTitle>
        <DialogDescription>An extra charge added to an order line, e.g. stain removal or urgent.</DialogDescription>
      </DialogHeader>

      <FormField label="Name" required error={errors.name}>
        {(f) => (
          <Input {...f} placeholder="e.g. Stain removal" value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label="Charged as" error={errors.charge_type}>
          {(f) => (
            <SelectField
              id={f.id}
              aria-invalid={f["aria-invalid"]}
              value={values.charge_type}
              options={CHARGE_TYPE_OPTIONS}
              onValueChange={(v) => v && set("charge_type", v as ChargeType)}
            />
          )}
        </FormField>
        <FormField label={values.charge_type === "percent" ? "Percent" : "Amount (AED)"} required error={errors.amount}>
          {(f) => (
            <Input
              {...f}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          )}
        </FormField>
      </div>

      <FormField label="Sequence" error={errors.sort_order} hint="Lower first.">
        {(f) => (
          <Input
            {...f}
            type="number"
            min={0}
            className="w-28"
            value={values.sort_order}
            onChange={(e) => set("sort_order", Math.max(0, Number(e.target.value) || 0))}
          />
        )}
      </FormField>

      <div className="flex items-center gap-3">
        <Switch id="upcharge-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label htmlFor="upcharge-active">Active</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {upcharge ? "Save changes" : "Add upcharge"}
        </Button>
      </DialogFooter>
    </form>
  )
}
