import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { cancelOrder } from "../services/order.service"
import type { Order } from "../types"

/** Cancel an order with a reason (kept on its timeline). A paid order is refunded first. */
export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
  onCancelled,
}: {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancelled: (order: Order) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <CancelForm order={order} onDone={() => onOpenChange(false)} onCancelled={onCancelled} />}
      </DialogContent>
    </Dialog>
  )
}

function CancelForm({
  order,
  onDone,
  onCancelled,
}: {
  order: Order
  onDone: () => void
  onCancelled: (order: Order) => void
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!reason.trim()) {
      setError("Say why the order is being cancelled.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      onCancelled(await cancelOrder(order.id, reason.trim()))
      onDone()
    } catch (err) {
      setError(getApiFieldErrors(err).reason ?? getApiErrorMessage(err, "Couldn't cancel the order."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Cancel order {order.number}?</DialogTitle>
        <DialogDescription>
          It leaves the production board and the customer's balance. This can't be undone.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="cancel-reason">Reason</FieldLabel>
        <Input
          id="cancel-reason"
          autoFocus
          maxLength={200}
          placeholder="e.g. Customer changed their mind"
          value={reason}
          aria-invalid={!!error || undefined}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Keep the order
        </Button>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          Cancel order
        </Button>
      </DialogFooter>
    </form>
  )
}
