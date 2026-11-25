import { useMemo, useState } from "react"
import { LockIcon, LockOpenIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { MASTER } from "@/features/masters/types"
import { useMasters } from "@/features/masters/use-masters"
import { fromCents, toCents } from "@/features/orders/lib/pricing"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { closeShift, getCurrentShift, getShifts, openShift } from "../services/payments.service"
import type { ShiftReport } from "../types"

const when = shopDateFormat({ weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

/** "−1.00" → short by AED 1.00 (red); "2.00" → over; "0.00" → matches. */
function DifferenceBadge({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const cents = toCents(value)
  if (cents === 0) return <Badge variant="secondary">Matches</Badge>
  return cents < 0 ? (
    <Badge variant="destructive">Short {formatMoney(fromCents(-cents))}</Badge>
  ) : (
    <Badge variant="outline">Over {formatMoney(value)}</Badge>
  )
}

/** Cash-up: open a shift with the drawer's float, close it by counting the drawer. */
export function ShiftsPage() {
  const current = useRecords(getCurrentShift, null as ShiftReport | null)
  const history = useRecords(getShifts, [] as ShiftReport[])
  const { can } = useAuth()
  const canUse = can("shifts.create")
  const [viewing, setViewing] = useState<ShiftReport | null>(null)

  const refresh = () => {
    void current.reload()
    void history.reload()
  }

  const columns = useMemo<DataTableColumn<ShiftReport>[]>(
    () => [
      { accessorKey: "opened_by_name", header: "Cashier", cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      {
        accessorKey: "opened_at",
        header: "Opened",
        sortingFn: "datetime",
        cell: ({ getValue }) => when.format(new Date(getValue() as string)),
      },
      {
        accessorKey: "closed_at",
        header: "Closed",
        cell: ({ row }) => (row.original.closed_at ? when.format(new Date(row.original.closed_at)) : <Badge>Open</Badge>),
      },
      { accessorKey: "expected_cash", header: "Expected cash", cell: ({ getValue }) => formatMoney(getValue() as string) },
      { accessorKey: "counted_cash", header: "Counted", cell: ({ getValue }) => formatMoney(getValue() as string | null) },
      {
        accessorKey: "difference",
        header: "Difference",
        enableSorting: false,
        cell: ({ row }) => <DifferenceBadge value={row.original.difference} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => <RowActionButtons label="shift report" onView={() => setViewing(row.original)} />,
      },
    ],
    [],
  )

  return (
    <>
      <PageHeader title="Cash-up" description="Open and close shifts and reconcile the cash drawer." />

      {current.loading ? (
        <div className="flex h-40 items-center justify-center gap-2 rounded-lg border text-muted-foreground">
          <Spinner />
          Loading…
        </div>
      ) : current.error ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(current.error)}</p>
      ) : current.data ? (
        <OpenShiftCard shift={current.data} canClose={canUse} onClosed={refresh} />
      ) : (
        <StartShiftCard canOpen={canUse} onOpened={refresh} />
      )}

      <div className="grid gap-2">
        <h3 className="font-medium">Shifts at this branch</h3>
        <DataTable
          columns={columns}
          data={history.data}
          isLoading={history.loading}
          error={history.error}
          onRetry={history.retry}
          getRowId={(s) => s.id}
          searchPlaceholder="Search by cashier…"
          emptyTitle="No shifts yet"
          emptyMessage="Shifts show up here once a cashier opens one."
        />
      </div>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>Shift report</DialogTitle>
                <DialogDescription>
                  {viewing.opened_by_name} · {viewing.branch_name}
                </DialogDescription>
              </DialogHeader>
              <ShiftFigures shift={viewing} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The numbers of a shift: cash in the drawer, then each payment method. */
function ShiftFigures({ shift }: { shift: ShiftReport }) {
  const methods = useMasters(MASTER.PAYMENT_METHOD)
  return (
    <dl className="grid gap-1.5 text-sm tabular-nums">
      <Row label="Opened" value={when.format(new Date(shift.opened_at))} />
      {shift.closed_at && <Row label="Closed" value={when.format(new Date(shift.closed_at))} />}
      <div className="my-1 border-t" />
      <Row label="Cash at the start" value={formatMoney(shift.opening_float)} />
      <Row label="Cash taken" value={`+ ${formatMoney(shift.cash_taken)}`} />
      <Row label="Cash given back" value={`− ${formatMoney(shift.cash_refunded)}`} />
      <Row label="Expected in the drawer" value={formatMoney(shift.expected_cash)} strong />
      {shift.counted_cash !== null && (
        <>
          <Row label="Counted" value={formatMoney(shift.counted_cash)} strong />
          <div className="flex justify-between">
            <dt>Difference</dt>
            <dd>
              <DifferenceBadge value={shift.difference} />
            </dd>
          </div>
        </>
      )}
      {shift.methods.some((m) => m.method !== "cash") && (
        <>
          <div className="my-1 border-t" />
          {shift.methods
            .filter((m) => m.method !== "cash")
            .map((m) => (
              <Row key={m.method} label={methods.nameOf(m.method)} value={formatMoney(m.net)} />
            ))}
        </>
      )}
      <div className="my-1 border-t" />
      <Row label="All money taken" value={formatMoney(shift.total_taken)} />
      <Row label="All refunds" value={formatMoney(shift.total_refunded)} />
      {shift.notes && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{shift.notes}</p>}
    </dl>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function StartShiftCard({ canOpen, onOpened }: { canOpen: boolean; onOpened: () => void }) {
  const [float, setFloat] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  async function open(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(undefined)
    try {
      await openShift(float || "0")
      toast.success("Shift opened")
      onOpened()
    } catch (err) {
      const fields = getApiFieldErrors(err)
      setError(fields.opening_float)
      if (!fields.opening_float) toast.error(Object.values(fields)[0] ?? getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockIcon className="size-4" />
          No shift open
        </CardTitle>
        <CardDescription>Open your shift before taking cash. Card and bank payments don't need one.</CardDescription>
      </CardHeader>
      {canOpen && (
        <form onSubmit={open}>
          <CardContent>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="shift-float">Cash in the drawer now (AED)</FieldLabel>
              <Input
                id="shift-float"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                className="max-w-40"
                value={float}
                onChange={(e) => setFloat(e.target.value)}
              />
              {error ? <FieldError>{error}</FieldError> : <FieldDescription>Count the change you start with.</FieldDescription>}
            </Field>
          </CardContent>
          <CardFooter className="mt-4 border-t">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : <LockOpenIcon data-icon="inline-start" />}
              Open shift
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}

function OpenShiftCard({ shift, canClose, onClosed }: { shift: ShiftReport; canClose: boolean; onClosed: () => void }) {
  const [counted, setCounted] = useState("")
  const [notes, setNotes] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const differenceCents = counted === "" ? null : toCents(counted) - toCents(shift.expected_cash)

  async function close() {
    if (saving) return
    setSaving(true)
    try {
      await closeShift(counted, notes)
      const cents = differenceCents ?? 0
      const message =
        cents === 0
          ? "Shift closed. The cash matches."
          : `Shift closed. The drawer is ${cents < 0 ? "short" : "over"} by ${formatMoney(fromCents(Math.abs(cents)))}.`
      if (cents === 0) toast.success(message)
      else toast.warning(message)
      onClosed()
    } catch (err) {
      toast.error(Object.values(getApiFieldErrors(err))[0] ?? getApiErrorMessage(err))
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockOpenIcon className="size-4" />
            Your shift is open
          </CardTitle>
          <CardDescription>
            Since {when.format(new Date(shift.opened_at))} at {shift.branch_name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShiftFigures shift={shift} />
        </CardContent>
      </Card>

      {canClose && (
        <Card>
          <CardHeader>
            <CardTitle>Close the shift</CardTitle>
            <CardDescription>Count all the cash in the drawer and enter the total.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="shift-counted">Cash counted (AED)</FieldLabel>
              <Input
                id="shift-counted"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                className="max-w-40"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
              {differenceCents !== null && (
                <FieldDescription>
                  Expected {formatMoney(shift.expected_cash)} ·{" "}
                  <DifferenceBadge value={fromCents(differenceCents)} />
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-notes">Notes</FieldLabel>
              <Textarea
                id="shift-notes"
                rows={2}
                placeholder="e.g. why the cash is short"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </CardContent>
          <CardFooter className="border-t">
            <Button disabled={counted === "" || saving} onClick={() => setConfirming(true)}>
              <LockIcon data-icon="inline-start" />
              Close shift
            </Button>
          </CardFooter>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Close your shift?"
        description={`Counted ${formatMoney(counted || "0")} against ${formatMoney(shift.expected_cash)} expected. You can't change it after closing.`}
        confirmLabel="Close shift"
        pending={saving}
        onConfirm={() => void close()}
      />
    </div>
  )
}
