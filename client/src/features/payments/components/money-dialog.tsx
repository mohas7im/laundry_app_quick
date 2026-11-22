import { useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
import { SelectField } from "@/components/select-field"
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
import { Spinner } from "@/components/ui/spinner"
import { MASTER } from "@/features/masters/types"
import { useMasters } from "@/features/masters/use-masters"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { formatMoney } from "@/lib/format"
import { MONEY_METHODS } from "../types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** The most that can be entered (the balance, or what was paid for a refund). */
  maxAmount: string
  /** Refunds: a reason is required. */
  withReason?: boolean
  submitLabel: (amount: string) => string
  onSubmit: (amount: string, paymentMethod: string, reason: string) => Promise<void>
}

/** Take a payment, give a refund or settle a balance: amount + cash / card / bank (+ reason). */
export function MoneyDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-sm">{props.open && <MoneyForm {...props} />}</DialogContent>
    </Dialog>
  )
}

function MoneyForm({ onOpenChange, title, description, maxAmount, withReason, submitLabel, onSubmit }: Props) {
  const methods = useMasters(MASTER.PAYMENT_METHOD)
  const options = methods.options.filter((o) => o.value && (MONEY_METHODS as readonly string[]).includes(o.value))

  const [amount, setAmount] = useState(maxAmount)
  const [method, setMethod] = useState<string | null>("cash")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !method) return
    setSaving(true)
    setErrors({})
    try {
      await onSubmit(amount, method, reason)
      onOpenChange(false)
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!fieldErrors.amount && !fieldErrors.payment_method && !fieldErrors.reason) {
        toast.error(Object.values(fieldErrors)[0] ?? getApiErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Amount (AED)" required error={errors.amount} hint={`Up to ${formatMoney(maxAmount)}`}>
          {(f) => (
            <Input
              {...f}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Method" required error={errors.payment_method}>
          {(f) => (
            <SelectField id={f.id} aria-invalid={f["aria-invalid"]} value={method} onValueChange={setMethod} options={options} />
          )}
        </FormField>
      </div>

      {withReason && (
        <FormField label="Reason" required error={errors.reason} hint="Kept with the refund, e.g. “Stain not removed”.">
          {(f) => <Input {...f} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !method || !Number(amount) || (withReason && !reason.trim())}>
          {saving && <Spinner data-icon="inline-start" />}
          {submitLabel(formatMoney(amount))}
        </Button>
      </DialogFooter>
    </form>
  )
}
