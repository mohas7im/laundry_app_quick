import { useCallback, useMemo, useState } from "react"
import { Link } from "react-router"

import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fromCents, toCents } from "@/features/orders/lib/pricing"
import { formatMoney, shopDateFormat, shopNow } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getPaymentsDay } from "../services/payments.service"
import type { PaymentRow, PaymentsDay } from "../types"

const time = shopDateFormat({ hour: "numeric", minute: "2-digit" })

/** Payments: money taken and given back at the branch on a day, with totals per method. */
export function PaymentsPage() {
  const [date, setDate] = useState(() => shopNow().toISOString().slice(0, 10)) // today, shop time
  const fetchDay = useCallback(() => getPaymentsDay(date), [date])
  const day = useRecords(fetchDay, null as PaymentsDay | null)

  const netCents = (day.data?.totals ?? []).reduce((sum, t) => sum + toCents(t.net), 0)

  const columns = useMemo<DataTableColumn<PaymentRow>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: "Time",
        sortingFn: "datetime",
        cell: ({ getValue }) => <span className="tabular-nums">{time.format(new Date(getValue() as string))}</span>,
      },
      {
        accessorKey: "order_number",
        header: "Order",
        cell: ({ row }) => (
          <Link to={`/orders/${row.original.order}`} className="font-medium tabular-nums hover:underline">
            {row.original.order_number}
          </Link>
        ),
      },
      { accessorKey: "customer_name", header: "Customer" },
      { accessorKey: "method_name", header: "Method" },
      {
        accessorKey: "amount",
        header: "Amount",
        sortingFn: "alphanumeric",
        cell: ({ row }) =>
          row.original.kind === "refund" ? (
            <span className="font-medium text-destructive tabular-nums">− {formatMoney(row.original.amount)}</span>
          ) : (
            <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>
          ),
      },
      {
        accessorKey: "kind",
        header: "Type",
        cell: ({ row }) =>
          row.original.kind === "refund" ? (
            <div className="grid">
              <Badge variant="destructive" className="w-fit">
                Refund
              </Badge>
              {row.original.reason && <span className="text-xs text-muted-foreground">{row.original.reason}</span>}
            </div>
          ) : (
            <Badge variant="secondary">Payment</Badge>
          ),
      },
      { accessorKey: "received_by_name", header: "By" },
    ],
    [],
  )

  return (
    <>
      <PageHeader title="Payments" description="Money taken and given back at this branch." />

      <Field className="max-w-48">
        <FieldLabel htmlFor="payments-date">Day</FieldLabel>
        <Input id="payments-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>

      {day.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {day.data.totals.map((t) => (
            <Card key={t.method} size="sm">
              <CardHeader>
                <CardDescription>{t.method_name}</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatMoney(t.net)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(t.taken)} taken
                {toCents(t.refunded) > 0 && ` · ${formatMoney(t.refunded)} refunded`}
              </CardContent>
            </Card>
          ))}
          <Card size="sm">
            <CardHeader>
              <CardDescription>All methods</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatMoney(fromCents(netCents))}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {day.data.payments.length} {day.data.payments.length === 1 ? "entry" : "entries"}
            </CardContent>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        data={day.data?.payments ?? []}
        isLoading={day.loading}
        error={day.error}
        onRetry={day.retry}
        getRowId={(p) => p.id}
        searchPlaceholder="Search by order or customer…"
        emptyTitle="No payments on this day"
        emptyMessage="Payments taken at the counter, at collection or on an order show up here."
      />
    </>
  )
}
