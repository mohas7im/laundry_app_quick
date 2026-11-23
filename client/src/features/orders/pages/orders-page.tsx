import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { PlusIcon, PrinterIcon } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { SelectField } from "@/components/select-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MASTER } from "@/features/masters/types"
import { useMasters } from "@/features/masters/use-masters"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { lineText, shopDayFromToday } from "../lib/summary"
import { getOrders } from "../services/order.service"
import { STATUS_LABELS, type OrderSearch, type OrderSearchRow } from "../types"

const dateTime = shopDateFormat({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const shortTime = shopDateFormat({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

/** The search starts with the last 30 days of orders. */
const defaultSearch = (): OrderSearch => ({ placed_from: shopDayFromToday(-30) })

const DATE_RANGES: { label: string; from: keyof OrderSearch; to: keyof OrderSearch }[] = [
  { label: "Placed", from: "placed_from", to: "placed_to" },
  { label: "Cleaned", from: "ready_from", to: "ready_to" },
  { label: "Collected", from: "collected_from", to: "collected_to" },
  { label: "Paid", from: "paid_from", to: "paid_to" },
]

/** Orders of the active branch: search by dates, status and payment. */
export function OrdersPage() {
  const navigate = useNavigate()
  const { can, activeBranch } = useAuth()
  const paymentMethods = useMasters(MASTER.PAYMENT_METHOD)

  // the form, and the search last run (Search applies the form)
  const [form, setForm] = useState<OrderSearch>(defaultSearch)
  const [search, setSearch] = useState<OrderSearch>(defaultSearch)
  const fetchOrders = useCallback(() => getOrders(search), [search])
  const orders = useRecords(fetchOrders, [] as OrderSearchRow[])

  const set = (key: keyof OrderSearch, value: string | undefined) => setForm((f) => ({ ...f, [key]: value || undefined }))

  const columns = useMemo<DataTableColumn<OrderSearchRow>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Order",
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium tabular-nums">{row.original.number}</span>
            {row.original.is_express && <Badge>Express</Badge>}
            {row.original.deadstock && <Badge variant="destructive">Deadstock</Badge>}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Placed",
        sortingFn: "datetime",
        cell: ({ row }) => <span className="whitespace-nowrap">{dateTime.format(new Date(row.original.created_at))}</span>,
      },
      {
        accessorKey: "ready_by",
        header: "Ready by",
        sortingFn: "datetime",
        cell: ({ row }) => {
          const ready = new Date(row.original.ready_by)
          const late = row.original.status === "received" && ready < new Date()
          return (
            <span className={`whitespace-nowrap ${late ? "font-medium text-destructive" : ""}`}>
              {dateTime.format(ready)}
            </span>
          )
        },
      },
      {
        id: "customer",
        // name and phone, so the search finds either
        accessorFn: (o) => `${o.customer_name} ${o.customer_phone}`,
        header: "Customer",
        cell: ({ row }) => (
          <div className="grid">
            <span>{row.original.customer_name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{row.original.customer_phone}</span>
          </div>
        ),
      },
      {
        id: "items",
        accessorFn: (o) => o.summary.map(lineText).join(", "),
        header: "Order",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="grid text-xs">
            {row.original.summary.map((l, i) => (
              <span key={i}>{lineText(l)}</span>
            ))}
            {!row.original.summary.length && <span className="text-muted-foreground">Bag drop</span>}
          </div>
        ),
      },
      {
        id: "staff",
        header: "Staff",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="grid text-xs">
            {row.original.staff.map((s) => (
              <span key={s.step} className="whitespace-nowrap">
                {s.step}: {s.name} <span className="text-muted-foreground">({shortTime.format(new Date(s.at))})</span>
              </span>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{STATUS_LABELS[row.original.status]}</Badge>,
      },
      {
        accessorKey: "notes",
        header: "Notes",
        enableSorting: false,
        cell: ({ row }) => <span className="line-clamp-2 max-w-48 text-xs">{row.original.notes}</span>,
      },
      {
        accessorKey: "total",
        header: "Total",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <div className="grid">
            <span className="tabular-nums">{formatMoney(row.original.total)}</span>
            {Number(row.original.balance) <= 0 ? (
              <span className="text-xs text-muted-foreground">Paid</span>
            ) : (
              <span className="text-xs text-destructive tabular-nums">Due {formatMoney(row.original.balance)}</span>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Print the receipt of ${row.original.number}`}
              title="Print receipt"
              onClick={() => navigate(`/orders/${row.original.id}?print=1`)}
            >
              <PrinterIcon />
            </Button>
            <RowActionButtons label={row.original.number} onView={() => navigate(`/orders/${row.original.id}`)} />
          </div>
        ),
      },
    ],
    [navigate],
  )

  return (
    <>
      <PageHeader
        title="Orders"
        description={activeBranch ? `Orders taken at ${activeBranch.name}.` : "Orders taken at this branch."}
      />

      <form
        className="grid gap-3 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch({ ...form })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Status"
            value={form.status ?? ""}
            onChange={(v) => set("status", v)}
            options={[
              { value: "", label: "Any status" },
              { value: "received", label: "In the workshop" },
              { value: "ready", label: "Ready" },
              { value: "collected", label: "Collected" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <FilterSelect
            label="Payment"
            value={form.payment ?? ""}
            onChange={(v) => set("payment", v)}
            options={[
              { value: "", label: "Paid or not" },
              { value: "paid", label: "Paid in full" },
              { value: "unpaid", label: "Balance due" },
            ]}
          />
          <FilterSelect
            label="Payment type"
            value={form.payment_method ?? ""}
            onChange={(v) => set("payment_method", v)}
            options={[{ value: "", label: "Any type" }, ...paymentMethods.options]}
          />
          <FilterSelect
            label="Order type"
            value={form.express ?? ""}
            onChange={(v) => set("express", v)}
            options={[
              { value: "", label: "Express and normal" },
              { value: "true", label: "Express only" },
              { value: "false", label: "Normal only" },
            ]}
          />
          {DATE_RANGES.map((range) => (
            <div key={range.label} className="grid gap-1.5">
              <Label>{range.label}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label={`${range.label} from`}
                  value={form[range.from] ?? ""}
                  onChange={(e) => set(range.from, e.target.value)}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  aria-label={`${range.label} to`}
                  value={form[range.to] ?? ""}
                  onChange={(e) => set(range.to, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label className="gap-2 font-normal">
            <Checkbox
              checked={form.deadstock === "true"}
              onCheckedChange={(on) => set("deadstock", on ? "true" : undefined)}
            />
            Deadstock only (ready, not collected for 45+ days)
          </Label>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(defaultSearch())
                setSearch(defaultSearch())
              }}
            >
              Reset
            </Button>
            <Button type="submit" disabled={orders.loading}>
              Search
            </Button>
          </div>
        </div>
      </form>

      <DataTable
        columns={columns}
        data={orders.data}
        isLoading={orders.loading}
        error={orders.error}
        onRetry={orders.retry}
        getRowId={(o) => o.id}
        searchPlaceholder="Search by order, customer or phone…"
        emptyTitle="No orders found"
        emptyMessage="No orders match these filters. Widen the dates or reset the search."
        toolbar={
          can("orders.create") && (
            <Button onClick={() => navigate("/orders/new")}>
              <PlusIcon data-icon="inline-start" />
              New order
            </Button>
          )
        }
      />
    </>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string | undefined) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <SelectField aria-label={label} value={value} onValueChange={(v) => onChange(v ?? "")} options={options} />
    </div>
  )
}
