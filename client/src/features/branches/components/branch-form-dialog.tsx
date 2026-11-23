import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
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
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useSaveBranchMutation, type Branch, type BranchInput } from "../api"

const empty: BranchInput = {
  name: "",
  code: "",
  phone: "",
  email: "",
  address: "",
  opens_at: null,
  closes_at: null,
  cutoff_time: null,
  closed_weekdays: [],
  holidays: [],
  is_active: true,
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** "08:00:00" → "08:00" for <input type="time">; "" → null for the API. */
const toInput = (t: string | null) => (t ? t.slice(0, 5) : "")
const fromInput = (t: string) => (t ? t : null)

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  branch?: Branch | null
}

export function BranchFormDialog({ open, onOpenChange, branch }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {/* key resets the form each time a different branch is opened */}
        {open && <BranchForm key={branch?.id ?? "new"} branch={branch} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function BranchForm({ branch, onDone }: { branch?: Branch | null; onDone: () => void }) {
  const [save, { isLoading: saving }] = useSaveBranchMutation()
  const { reload } = useAuth()
  const [values, setValues] = useState<BranchInput>(() =>
    branch
      ? {
          name: branch.name,
          code: branch.code,
          phone: branch.phone,
          email: branch.email,
          address: branch.address,
          opens_at: branch.opens_at,
          closes_at: branch.closes_at,
          cutoff_time: branch.cutoff_time,
          closed_weekdays: branch.closed_weekdays,
          holidays: branch.holidays,
          is_active: branch.is_active,
        }
      : empty,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof BranchInput>(key: K, value: BranchInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    try {
      // holidays without a date are left out
      await save({ id: branch?.id, data: { ...values, holidays: values.holidays.filter((h) => h.date) } }).unwrap()
      await reload() // branch list in the switcher may have changed
      toast.success(branch ? "Branch updated" : "Branch created")
      onDone()
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
        <DialogDescription>Each branch is a shop location with its own staff.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label="Name" required error={errors.name}>
          {(f) => <Input {...f} value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Code" required error={errors.code} hint="e.g. DXB1">
          {(f) => (
            <Input
              {...f}
              value={values.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              maxLength={20}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone" error={errors.phone}>
          {(f) => <Input {...f} type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />}
        </FormField>
        <FormField label="Email" error={errors.email}>
          {(f) => <Input {...f} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />}
        </FormField>
      </div>

      <FormField label="Address" error={errors.address}>
        {(f) => <Textarea {...f} rows={2} value={values.address} onChange={(e) => set("address", e.target.value)} />}
      </FormField>

      <Separator />
      <div className="grid gap-1">
        <span className="text-sm font-medium">Hours and ready-by</span>
        <span className="text-xs text-muted-foreground">
          The counter never promises an order after closing, on a closed day or on a holiday.
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Opens" error={errors.opens_at}>
          {(f) => <Input {...f} type="time" value={toInput(values.opens_at)} onChange={(e) => set("opens_at", fromInput(e.target.value))} />}
        </FormField>
        <FormField label="Closes" error={errors.closes_at}>
          {(f) => <Input {...f} type="time" value={toInput(values.closes_at)} onChange={(e) => set("closes_at", fromInput(e.target.value))} />}
        </FormField>
        <FormField label="Cut-off" error={errors.cutoff_time} hint="Later orders count from tomorrow.">
          {(f) => <Input {...f} type="time" value={toInput(values.cutoff_time)} onChange={(e) => set("cutoff_time", fromInput(e.target.value))} />}
        </FormField>
      </div>
      <div className="grid gap-2">
        <Label>Closed on</Label>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((day, index) => (
            <Toggle
              key={day}
              variant="outline"
              size="sm"
              pressed={values.closed_weekdays.includes(index)}
              onPressedChange={(on) =>
                set(
                  "closed_weekdays",
                  on ? [...values.closed_weekdays, index].sort() : values.closed_weekdays.filter((d) => d !== index),
                )
              }
            >
              {day}
            </Toggle>
          ))}
        </div>
        {errors.closed_weekdays && <p className="text-xs text-destructive">{errors.closed_weekdays}</p>}
      </div>
      <div className="grid gap-2">
        <Label>Holidays</Label>
        {values.holidays.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="date"
              className="w-40"
              aria-label={`Holiday ${i + 1} date`}
              value={h.date}
              onChange={(e) => set("holidays", values.holidays.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
            />
            <Input
              placeholder="e.g. National Day"
              aria-label={`Holiday ${i + 1} name`}
              value={h.name}
              onChange={(e) => set("holidays", values.holidays.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove holiday ${i + 1}`}
              onClick={() => set("holidays", values.holidays.filter((_, j) => j !== i))}
            >
              <XIcon />
            </Button>
          </div>
        ))}
        {errors.holidays && <p className="text-xs text-destructive">{errors.holidays}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => set("holidays", [...values.holidays, { date: "", name: "" }])}
        >
          <PlusIcon data-icon="inline-start" />
          Add holiday
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="branch-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label htmlFor="branch-active">Active</Label>
        <span className="text-xs text-muted-foreground">Staff can't work in inactive branches.</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {branch ? "Save changes" : "Create branch"}
        </Button>
      </DialogFooter>
    </form>
  )
}
