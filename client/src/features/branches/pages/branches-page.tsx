import { useMemo, useState } from "react"
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
import { useGetBranchesQuery, useDeleteBranchMutation, type Branch } from "../api"
import { BranchFormDialog } from "../components/branch-form-dialog"

const NO_BRANCHES: Branch[] = []

export function BranchesPage() {
  const { data = NO_BRANCHES, isLoading } = useGetBranchesQuery()
  const [remove, { isLoading: removing }] = useDeleteBranchMutation()
  const { can, reload } = useAuth()
  const canEdit = can("branches.edit")
  const canDelete = can("branches.delete")

  const [editing, setEditing] = useState<Branch | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Branch | null>(null)

  const columns = useMemo<DataTableColumn<Branch>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Branch",
        cell: ({ row }) => (
          <div className="grid">
            <span className="font-medium">{row.original.name}</span>
            {row.original.address && (
              <span className="max-w-xs truncate text-xs text-muted-foreground">{row.original.address}</span>
            )}
          </div>
        ),
      },
      { accessorKey: "code", header: "Code" },
      { accessorKey: "phone", header: "Phone", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "user_count", header: "Staff" },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) =>
          row.original.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>,
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
    [canEdit, canDelete],
  )

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove(deleting.id).unwrap()
      await reload()
      toast.success("Branch deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Branches"
        description="Shop locations. Staff are assigned to branches on the Users page."
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowId={(b) => String(b.id)}
        searchPlaceholder="Search branches…"
        emptyMessage="No branches yet. Create your first branch."
        toolbar={
          can("branches.create") && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            New branch
          </Button>
          )
        }
      />

      <BranchFormDialog open={formOpen} onOpenChange={setFormOpen} branch={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This can't be undone. Branches with staff can't be deleted — deactivate them instead."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
