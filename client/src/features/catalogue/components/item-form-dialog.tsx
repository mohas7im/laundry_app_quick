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
import { createItem, updateItem } from "../services/catalogue.service"
import {
  CATEGORY_LABELS,
  PRICING_TYPE_LABELS,
  type Item,
  type ItemCategory,
  type ItemRequest,
  type PricingType,
} from "../types"

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
const PRICING_OPTIONS = Object.entries(PRICING_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const PRICING_HINTS: Record<PricingType, string> = {
  unit: "Priced per piece, e.g. a shirt.",
  per_kg: "Priced by weight, e.g. wash & fold.",
  per_m2: "Priced by area, e.g. carpets and curtains.",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Item | null
  onSaved: () => void
}

export function ItemFormDialog({ open, onOpenChange, item, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <ItemForm key={item?.id ?? "new"} item={item} onSaved={onSaved} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ItemForm({ item, onSaved, onDone }: { item?: Item | null; onSaved: () => void; onDone: () => void }) {
  const [values, setValues] = useState<ItemRequest>(() =>
    item
      ? {
          name: item.name,
          category: item.category,
          pricing_type: item.pricing_type,
          sort_order: item.sort_order,
          is_active: item.is_active,
        }
      : { name: "", category: "men", pricing_type: "unit", sort_order: 0, is_active: true },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof ItemRequest>(key: K, value: ItemRequest[K]) => setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrors({})
    try {
      if (item) await updateItem(item.id, values)
      else await createItem(values)
      toast.success(item ? "Item updated" : "Item added")
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
        <DialogTitle>{item ? "Edit item" : "New item"}</DialogTitle>
        <DialogDescription>Something customers bring in. Set its price per service on the Prices page.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <FormField label="Name" required error={errors.name}>
          {(f) => <Input {...f} placeholder="e.g. Kandura" value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Category" error={errors.category}>
          {(f) => (
            <SelectField
              id={f.id}
              aria-invalid={f["aria-invalid"]}
              value={values.category}
              options={CATEGORY_OPTIONS}
              onValueChange={(v) => v && set("category", v as ItemCategory)}
            />
          )}
        </FormField>
        <FormField label="Charged" error={errors.pricing_type} hint={PRICING_HINTS[values.pricing_type]}>
          {(f) => (
            <SelectField
              id={f.id}
              aria-invalid={f["aria-invalid"]}
              value={values.pricing_type}
              options={PRICING_OPTIONS}
              onValueChange={(v) => v && set("pricing_type", v as PricingType)}
            />
          )}
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="item-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label htmlFor="item-active">Active</Label>
        <span className="text-xs text-muted-foreground">Inactive items aren't offered on new orders.</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {item ? "Save changes" : "Add item"}
        </Button>
      </DialogFooter>
    </form>
  )
}
