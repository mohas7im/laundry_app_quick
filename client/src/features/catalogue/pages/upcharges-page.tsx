import { useMemo, useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { ActiveBadge } from "../components/active-badge"
import { UpchargeFormDialog } from "../components/upcharge-form-dialog"
import { deleteUpcharge, getUpcharges } from "../services/catalogue.service"
import type { Upcharge } from "../types"

export function UpchargesPage() {
  const upcharges = useRecords(getUpcharges, [] as Upcharge[])
  const { can } = useAuth()
  const canEdit = can("upcharges.edit")
  const canDelete = can("upcharges.delete")

  const [editing, setEditing] = useState<Upcharge | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Upcharge | null>(null)
  const [removing, setRemoving] = useState(false)

  const columns = useMemo<DataTableColumn<Upcharge>[]>(
    () => [
      { accessorKey: "name", header: "Upcharge", cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      {
        accessorKey: "amount",
        header: "Charge",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.charge_type === "percent" ? `${Number(row.original.amount)}%` : formatMoney(row.original.amount)}
          </span>
        ),
      },
      { accessorKey: "sort_order", header: "Sequence" },
      { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
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
    [canEdit, canDelete],
  )

  async function confirmDelete() {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await deleteUpcharge(deleting.id)
      toast.success("Upcharge deleted")
      upcharges.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setRemoving(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader title="Upcharges" description="Manage extra charges such as stain removal and starch." />

      <DataTable
        columns={columns}
        data={upcharges.data}
        isLoading={upcharges.loading}
        error={upcharges.error}
        onRetry={upcharges.retry}
        getRowId={(u) => u.id}
        searchPlaceholder="Search upcharges…"
        emptyTitle="No upcharges yet"
        emptyMessage="Add extra charges like stain removal or urgent."
        toolbar={
          can("upcharges.create") && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New upcharge
            </Button>
          )
        }
      />

      <UpchargeFormDialog open={formOpen} onOpenChange={setFormOpen} upcharge={editing} onSaved={upcharges.reload} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This can't be undone. To stop using it, make it inactive instead."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
