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
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { createCustomer, updateCustomer } from "../services/customer.service"
import type { Customer, CustomerRequest } from "../types"

const empty: CustomerRequest = { name: "", phone: "", email: "", address: "", notes: "" }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  /** Called after a successful save (the list isn't cached, so the page refetches it). */
  onSaved?: () => void
}

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
  onSaved?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState<CustomerRequest>(() => {
    if (!customer) return empty
    const { name, phone, email, address, notes } = customer
    return { name, phone, email, address, notes }
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
      if (customer) await updateCustomer(customer.id, values)
      else await createCustomer(values)
      toast.success(customer ? "Customer updated" : "Customer added")
      onSaved?.()
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

      <FormField label="Notes" error={errors.notes} hint='Preferences staff should see, e.g. "No starch".'>
        {(f) => <Textarea {...f} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
      </FormField>

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
