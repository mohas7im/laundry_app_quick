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
import { useRecords } from "@/lib/use-records"
import { ActiveBadge } from "../components/active-badge"
import { ItemFormDialog } from "../components/item-form-dialog"
import { deleteItem, getItems } from "../services/catalogue.service"
import type { Item } from "../types"

export function ItemsPage() {
  const items = useRecords(getItems, [] as Item[])
  const { can } = useAuth()
  const canEdit = can("items.edit")
  const canDelete = can("items.delete")

  const [editing, setEditing] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [removing, setRemoving] = useState(false)

  const columns = useMemo<DataTableColumn<Item>[]>(
    () => [
      { accessorKey: "name", header: "Item", cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      { accessorKey: "category_name", header: "Category" },
      { accessorKey: "pricing_type_name", header: "Charged" },
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
      await deleteItem(deleting.id)
      toast.success("Item deleted")
      items.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setRemoving(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader title="Items" description="What customers bring in. One list, priced per service on the Prices page." />

      <DataTable
        columns={columns}
        data={items.data}
        isLoading={items.loading}
        error={items.error}
        onRetry={items.retry}
        getRowId={(i) => i.id}
        searchPlaceholder="Search items…"
        emptyTitle="No items yet"
        emptyMessage="Add the garments and household items you clean, e.g. Kandura or Blanket."
        toolbar={
          can("items.create") && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New item
            </Button>
          )
        }
      />

      <ItemFormDialog open={formOpen} onOpenChange={setFormOpen} item={editing} onSaved={items.reload} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Its prices in every price list are deleted too. To stop offering it but keep the prices, make it inactive instead."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
