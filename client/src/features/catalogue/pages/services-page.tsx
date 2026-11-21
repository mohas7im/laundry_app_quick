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
import { ServiceFormDialog } from "../components/service-form-dialog"
import { deleteService, getServices } from "../services/catalogue.service"
import type { Service } from "../types"

export function ServicesPage() {
  const services = useRecords(getServices, [] as Service[])
  const { can } = useAuth()
  const canEdit = can("services.edit")
  const canDelete = can("services.delete")

  const [editing, setEditing] = useState<Service | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Service | null>(null)
  const [removing, setRemoving] = useState(false)

  function openForm(service: Service | null) {
    setEditing(service)
    setFormOpen(true)
  }

  const columns = useMemo<DataTableColumn<Service>[]>(
    () => [
      { accessorKey: "name", header: "Service", cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
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
      await deleteService(deleting.id)
      toast.success("Service deleted")
      services.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setRemoving(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader title="Services" description="What the shop does to an item: dry clean, wash & iron, press, repair." />

      <DataTable
        columns={columns}
        data={services.data}
        isLoading={services.loading}
        error={services.error}
        onRetry={services.retry}
        getRowId={(s) => s.id}
        searchPlaceholder="Search services…"
        emptyTitle="No services yet"
        emptyMessage="Add the services you offer, e.g. Dry Clean."
        toolbar={
          can("services.create") && (
            <Button onClick={() => openForm(null)}>
              <PlusIcon data-icon="inline-start" />
              New service
            </Button>
          )
        }
      />

      <ServiceFormDialog open={formOpen} onOpenChange={setFormOpen} service={editing} onSaved={services.reload} />

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
