import { useMemo } from "react"
import { useNavigate } from "react-router"
import { PlusIcon } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getOrders } from "../services/order.service"
import { STATUS_LABELS, type OrderListRow } from "../types"

const dateTime = shopDateFormat({
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})

/** Orders of the active branch. */
export function OrdersPage() {
  const navigate = useNavigate()
  const orders = useRecords(getOrders, [] as OrderListRow[])
  const { can, activeBranch } = useAuth()

  const columns = useMemo<DataTableColumn<OrderListRow>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Order",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{row.original.number}</span>
            {row.original.is_express && <Badge>Express</Badge>}
          </span>
        ),
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
        accessorKey: "ready_by",
        header: "Ready by",
        sortingFn: "datetime",
        cell: ({ row }) => {
          const ready = new Date(row.original.ready_by)
          const late = row.original.status === "received" && ready < new Date()
          return <span className={late ? "font-medium text-destructive" : undefined}>{dateTime.format(ready)}</span>
        },
      },
      { accessorKey: "pieces", header: "Pieces" },
      {
        accessorKey: "total",
        header: "Total",
        sortingFn: "alphanumeric",
        cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.total)}</span>,
      },
      {
        accessorKey: "balance",
        header: "Payment",
        enableSorting: false,
        cell: ({ row }) =>
          Number(row.original.balance) <= 0 ? (
            <Badge variant="secondary">Paid</Badge>
          ) : (
            <span className="tabular-nums">Due {formatMoney(row.original.balance)}</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{STATUS_LABELS[row.original.status]}</Badge>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionButtons label={row.original.number} onView={() => navigate(`/orders/${row.original.id}`)} />
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

      <DataTable
        columns={columns}
        data={orders.data}
        isLoading={orders.loading}
        error={orders.error}
        onRetry={orders.retry}
        getRowId={(o) => o.id}
        searchPlaceholder="Search by order, customer or phone…"
        emptyTitle="No orders yet"
        emptyMessage="Orders taken at the counter show up here."
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
