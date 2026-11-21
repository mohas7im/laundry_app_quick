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
import { createPriceList, updatePriceList } from "../services/catalogue.service"
import type { PriceList, PriceListRequest } from "../types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceList?: PriceList | null
  onSaved: () => void
}

export function PriceListFormDialog({ open, onOpenChange, priceList, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <PriceListForm
            key={priceList?.id ?? "new"}
            priceList={priceList}
            onSaved={onSaved}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PriceListForm({
  priceList,
  onSaved,
  onDone,
}: {
  priceList?: PriceList | null
  onSaved: () => void
  onDone: () => void
}) {
  const [values, setValues] = useState<PriceListRequest>(() =>
    priceList
      ? { name: priceList.name, is_default: priceList.is_default, is_active: priceList.is_active }
      : { name: "", is_default: false, is_active: true },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // the default stays the default until another list takes over
  const isCurrentDefault = !!priceList?.is_default

  const set = <K extends keyof PriceListRequest>(key: K, value: PriceListRequest[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrors({})
    try {
      if (priceList) await updatePriceList(priceList.id, values)
      else await createPriceList(values)
      toast.success(priceList ? "Price list updated" : "Price list added")
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
        <DialogTitle>{priceList ? "Edit price list" : "New price list"}</DialogTitle>
        <DialogDescription>A set of prices, e.g. Walk-in, Online or a hotel contract.</DialogDescription>
      </DialogHeader>

      <FormField label="Name" required error={errors.name}>
        {(f) => <Input {...f} placeholder="e.g. Walk-in" value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
      </FormField>

      <div className="grid gap-1.5">
        <div className="flex items-center gap-3">
          <Switch
            id="price-list-default"
            checked={values.is_default}
            disabled={isCurrentDefault}
            onCheckedChange={(v) => setValues((s) => ({ ...s, is_default: v, is_active: v ? true : s.is_active }))}
          />
          <Label htmlFor="price-list-default">Default price list</Label>
        </div>
        <p className={errors.is_default ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {errors.is_default ??
            (isCurrentDefault
              ? "This is the default. To change it, make another list the default."
              : "Used for customers without a price list of their own.")}
        </p>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center gap-3">
          <Switch
            id="price-list-active"
            checked={values.is_active}
            disabled={values.is_default}
            onCheckedChange={(v) => set("is_active", v)}
          />
          <Label htmlFor="price-list-active">Active</Label>
        </div>
        {errors.is_active && <p className="text-xs text-destructive">{errors.is_active}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {priceList ? "Save changes" : "Add price list"}
        </Button>
      </DialogFooter>
    </form>
  )
}
