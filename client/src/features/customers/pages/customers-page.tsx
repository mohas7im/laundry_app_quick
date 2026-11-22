import { useCallback, useEffect, useMemo, useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { MoneyDialog } from "@/features/payments/components/money-dialog"
import { settleCustomer } from "@/features/payments/services/payments.service"
import { deleteCustomer, getCustomers } from "../services/customer.service"
import { CustomerFormDialog } from "../components/customer-form-dialog"
import type { Customer } from "../types"

const dateFormat = shopDateFormat({ day: "numeric", month: "short", year: "numeric" })

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [removing, setRemoving] = useState(false)

  /** Fetch the list (not cached: always from the server). Keeps the rows on screen meanwhile. */
  const fetchCustomers = useCallback(
    () =>
      getCustomers()
        .then((list) => {
          setCustomers(list)
          setError(null)
        })
        .catch(setError)
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  /** "Try again" after a failed load: show the spinner again. */
  function retry() {
    setLoading(true)
    setError(null)
    fetchCustomers()
  }

  const { can } = useAuth()
  const canEdit = can("customers.edit")
  const canDelete = can("customers.delete")
  const canSettle = can("payments.create")
  const [settling, setSettling] = useState<Customer | null>(null)

  const [editing, setEditing] = useState<Customer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Customer | null>(null)

  const columns = useMemo<DataTableColumn<Customer>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Customer",
        cell: ({ row }) => (
          <div className="grid">
            <span className="font-medium">{row.original.name}</span>
            {row.original.notes && (
              <span className="max-w-xs truncate text-xs text-muted-foreground">{row.original.notes}</span>
            )}
          </div>
        ),
      },
      { accessorKey: "phone", header: "Phone", cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> },
      { accessorKey: "email", header: "Email", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ getValue }) => <span className="block max-w-xs truncate">{getValue() || "—"}</span>,
      },
      { accessorKey: "branch_name", header: "Registered at" },
      {
        accessorKey: "balance",
        header: "Balance",
        sortingFn: "alphanumeric",
        cell: ({ row }) =>
          Number(row.original.balance) > 0 ? (
            <span className="flex items-center gap-2">
              <span className="font-medium tabular-nums">Owes {formatMoney(row.original.balance)}</span>
              {canSettle && (
                <Button variant="outline" size="xs" onClick={() => setSettling(row.original)}>
                  Settle
                </Button>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "created_at",
        header: "Added",
        sortingFn: "datetime",
        cell: ({ getValue }) => dateFormat.format(new Date(getValue() as string)),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionButtons
            label={row.original.name}
            onEdit={
              canEdit
                ? () => {
                    setEditing(row.original)
                    setFormOpen(true)
                  }
                : undefined
            }
            onDelete={canDelete ? () => setDeleting(row.original) : undefined}
          />
        ),
      },
    ],
    [canEdit, canDelete, canSettle],
  )

  async function confirmDelete() {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await deleteCustomer(deleting.id)
      toast.success("Customer deleted")
      fetchCustomers()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setRemoving(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader title="Customers" description="Everyone who brings laundry to any of your branches." />

      <DataTable
        columns={columns}
        data={customers}
        isLoading={loading}
        error={error}
        onRetry={retry}
        getRowId={(c) => c.id}
        searchPlaceholder="Search by name, phone or email…"
        emptyTitle="No customers yet"
        emptyMessage="Add your first customer to start taking orders."
        toolbar={
          can("customers.create") && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New customer
            </Button>
          )
        }
      />

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} onSaved={fetchCustomers} />

      <MoneyDialog
        open={!!settling}
        onOpenChange={(open) => !open && setSettling(null)}
        title={`Settle ${settling?.name ?? ""}'s balance`}
        description={`Owes ${formatMoney(settling?.balance)} on unpaid orders. The payment goes to the oldest orders first.`}
        maxAmount={settling?.balance ?? "0"}
        submitLabel={(amount) => `Take ${amount}`}
        onSubmit={async (amount, method) => {
          await settleCustomer(settling!.id, amount, method)
          toast.success(`${formatMoney(amount)} received from ${settling!.name}`)
          fetchCustomers()
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This can't be undone. Customers who have orders can't be deleted."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
