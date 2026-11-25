import { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useRecords } from "@/lib/use-records"
import { ActiveBadge } from "../components/active-badge"
import { PriceListFormDialog } from "../components/price-list-form-dialog"
import { deletePriceList, getPriceLists } from "../services/catalogue.service"
import type { PriceList } from "../types"

export function PriceListsPage() {
  const navigate = useNavigate()
  const priceLists = useRecords(getPriceLists, [] as PriceList[])
  const { can } = useAuth()
  const canEdit = can("price_lists.edit")
  const canDelete = can("price_lists.delete")
  const canViewPrices = can("prices.view")

  const [editing, setEditing] = useState<PriceList | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<PriceList | null>(null)
  const [removing, setRemoving] = useState(false)

  const columns = useMemo<DataTableColumn<PriceList>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Price list",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.is_default && <Badge>Default</Badge>}
          </span>
        ),
      },
      { accessorKey: "price_count", header: "Prices set" },
      { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionButtons
            label={row.original.name}
            onView={canViewPrices ? () => navigate("/prices", { state: { priceListId: row.original.id } }) : undefined}
            onEdit={
              canEdit
                ? () => {
                    setEditing(row.original)
                    setFormOpen(true)
                  }
                : undefined
            }
            onDelete={canDelete && !row.original.is_default ? () => setDeleting(row.original) : undefined}
          />
        ),
      },
    ],
    [canEdit, canDelete, canViewPrices, navigate],
  )

  async function confirmDelete() {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await deletePriceList(deleting.id)
      toast.success("Price list deleted")
      priceLists.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setRemoving(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Price Lists"
        description="Manage price lists such as Walk-in and Online."
      />

      <DataTable
        columns={columns}
        data={priceLists.data}
        isLoading={priceLists.loading}
        error={priceLists.error}
        onRetry={priceLists.retry}
        getRowId={(p) => p.id}
        searchPlaceholder="Search price lists…"
        emptyTitle="No price lists yet"
        emptyMessage="Add your first one, e.g. Walk-in. It becomes the default."
        toolbar={
          can("price_lists.create") && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New price list
            </Button>
          )
        }
      />

      <PriceListFormDialog open={formOpen} onOpenChange={setFormOpen} priceList={editing} onSaved={priceLists.reload} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="All prices in this list are deleted too. This can't be undone."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
