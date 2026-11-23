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
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { createService, updateService } from "../services/catalogue.service"
import type { Service, ServiceRequest } from "../types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  service?: Service | null
  onSaved: () => void
}

export function ServiceFormDialog({ open, onOpenChange, service, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ServiceForm key={service?.id ?? "new"} service={service} onSaved={onSaved} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ServiceForm({ service, onSaved, onDone }: { service?: Service | null; onSaved: () => void; onDone: () => void }) {
  const [values, setValues] = useState<ServiceRequest>(() =>
    service
      ? { name: service.name, ready_days: service.ready_days, sort_order: service.sort_order, is_active: service.is_active }
      : { name: "", ready_days: null, sort_order: 0, is_active: true },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof ServiceRequest>(key: K, value: ServiceRequest[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrors({})
    try {
      if (service) await updateService(service.id, values)
      else await createService(values)
      toast.success(service ? "Service updated" : "Service added")
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
        <DialogTitle>{service ? "Edit service" : "New service"}</DialogTitle>
        <DialogDescription>What the shop does to an item, e.g. Dry Clean or Wash & Iron.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <FormField label="Name" required error={errors.name}>
          {(f) => <Input {...f} value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Sequence" error={errors.sort_order} hint="Lower first.">
          {(f) => (
            <Input
              {...f}
              type="number"
              min={0}
              value={values.sort_order}
              onChange={(e) => set("sort_order", Math.max(0, Number(e.target.value) || 0))}
            />
          )}
        </FormField>
      </div>

      <FormField label="Ready in (days)" error={errors.ready_days}
        hint="For normal orders, e.g. Wash 1, Dry clean 2. Leave empty to use the shop's default (2 days).">
        {(f) => (
          <Input
            {...f}
            type="number"
            min={0}
            max={60}
            className="w-28"
            placeholder="Default"
            value={values.ready_days ?? ""}
            onChange={(e) => set("ready_days", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
          />
        )}
      </FormField>

      <div className="flex items-center gap-3">
        <Switch id="service-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label htmlFor="service-active">Active</Label>
        <span className="text-xs text-muted-foreground">Inactive services aren't offered on new orders.</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {service ? "Save changes" : "Add service"}
        </Button>
      </DialogFooter>
    </form>
  )
}
