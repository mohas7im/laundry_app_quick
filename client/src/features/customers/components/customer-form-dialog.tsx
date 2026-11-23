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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useRecords } from "@/lib/use-records"
import { createCustomer, getCustomerOptions, updateCustomer } from "../services/customer.service"
import type { Customer, CustomerOptions, CustomerRequest } from "../types"

const empty: CustomerRequest = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  preferences: {},
  price_list: null,
  discount_percent: "0",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  /** Called after a successful save (the list isn't cached, so the page refetches it). */
  onSaved?: (customer: Customer) => void
}

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* key resets the form each time a different customer is opened */}
        {open && (
          <CustomerForm
            key={customer?.id ?? "new"}
            customer={customer}
            onDone={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CustomerForm({
  customer,
  onDone,
  onSaved,
}: {
  customer?: Customer | null
  onDone: () => void
  onSaved?: (customer: Customer) => void
}) {
  const [saving, setSaving] = useState(false)
  // price lists and preference questions
  const options = useRecords(getCustomerOptions, null as CustomerOptions | null)
  const [values, setValues] = useState<CustomerRequest>(() => {
    if (!customer) return empty
    const { name, phone, email, address, notes, preferences, price_list, discount_percent } = customer
    return { name, phone, email, address, notes, preferences, price_list, discount_percent: String(Number(discount_percent)) }
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof CustomerRequest>(key: K, value: CustomerRequest[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return // one request at a time (double click / Enter)
    setSaving(true)
    setErrors({})
    try {
      const payload = { ...values, discount_percent: values.discount_percent.trim() || "0" }
      const saved = customer ? await updateCustomer(customer.id, payload) : await createCustomer(payload)
      toast.success(customer ? "Customer updated" : "Customer added")
      onSaved?.(saved)
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
        <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
        <DialogDescription>
          {customer
            ? `Registered at ${customer.branch_name}.`
            : "Customers are shared by every branch. The phone number finds them at the counter."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={errors.name}>
          {(f) => <Input {...f} value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Phone" required error={errors.phone}>
          {(f) => (
            <Input
              {...f}
              type="tel"
              inputMode="tel"
              placeholder="+971 50 123 4567"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          )}
        </FormField>
      </div>

      <FormField label="Email" error={errors.email}>
        {(f) => <Input {...f} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />}
      </FormField>

      <FormField label="Address" error={errors.address} hint="For pickup and delivery.">
        {(f) => <Textarea {...f} rows={2} value={values.address} onChange={(e) => set("address", e.target.value)} />}
      </FormField>

      <FormField label="Notes" error={errors.notes}
        hint='Filled in on each new order, e.g. "Gutra hanger". The counter can save them from an order too.'>
        {(f) => <Textarea {...f} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
      </FormField>

      {options.data && (
        <>
          <Separator />
          <div className="grid gap-3">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">Preferences</span>
              <span className="text-xs text-muted-foreground">Shown on every order for this customer.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {options.data.preferences.map((pref) => (
                <FormField key={pref.code} label={pref.name}>
                  {(f) => (
                    <SelectField
                      id={f.id}
                      value={values.preferences[pref.code] ?? ""}
                      options={[{ value: "", label: "Any" }, ...pref.options.map((o) => ({ value: o.code, label: o.name }))]}
                      onValueChange={(v) => set("preferences", { ...values.preferences, [pref.code]: v ?? "" })}
                    />
                  )}
                </FormField>
              ))}
            </div>
            {errors.preferences && <p className="text-xs text-destructive">{errors.preferences}</p>}
          </div>

          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Price list" error={errors.price_list}
              hint="Their own prices. Items not in it use the default list.">
              {(f) => (
                <SelectField
                  id={f.id}
                  aria-invalid={f["aria-invalid"]}
                  value={values.price_list ?? ""}
                  options={[
                    { value: "", label: "Default prices" },
                    ...options.data!.price_lists.filter((p) => !p.is_default).map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  onValueChange={(v) => set("price_list", v || null)}
                />
              )}
            </FormField>
            <FormField label="Discount (%)" error={errors.discount_percent}
              hint="Taken off every order, no approval needed.">
              {(f) => (
                <Input {...f} type="number" inputMode="decimal" min={0} max={100} step={0.5} className="w-28"
                  value={values.discount_percent} onChange={(e) => set("discount_percent", e.target.value)} />
              )}
            </FormField>
          </div>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {customer ? "Save changes" : "Add customer"}
        </Button>
      </DialogFooter>
    </form>
  )
}
