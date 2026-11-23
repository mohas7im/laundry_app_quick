import { useState } from "react"
import { ShieldCheckIcon } from "lucide-react"

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

/**
 * A manager approves at the counter with their PIN (a discount over the cashier's limit,
 * a change to a paid order). `onApprove` resends the request with the PIN; it returns an
 * error message to show (wrong PIN, can't approve), or null when it went through.
 */
export function ApprovalPinDialog({
  reason,
  onApprove,
  onCancel,
}: {
  /** Why approval is needed (from the API); null = closed. */
  reason: string | null
  onApprove: (pin: string) => Promise<string | null>
  onCancel: () => void
}) {
  return (
    <Dialog open={reason !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        {reason !== null && <PinForm reason={reason} onApprove={onApprove} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  )
}

function PinForm({
  reason,
  onApprove,
  onCancel,
}: {
  reason: string
  onApprove: (pin: string) => Promise<string | null>
  onCancel: () => void
}) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || pin.length < 4) return
    setBusy(true)
    setError(null)
    const problem = await onApprove(pin)
    setBusy(false)
    if (problem) {
      setError(problem)
      setPin("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5" />
          Manager approval
        </DialogTitle>
        <DialogDescription>{reason}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="approval-pin">Manager's PIN</FieldLabel>
        <Input
          id="approval-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          className="text-center text-lg tracking-[0.5em]"
          value={pin}
          aria-invalid={!!error || undefined}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || pin.length < 4}>
          {busy && <Spinner data-icon="inline-start" />}
          Approve
        </Button>
      </DialogFooter>
    </form>
  )
}
