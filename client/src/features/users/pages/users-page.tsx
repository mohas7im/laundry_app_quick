import { useMemo, useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActions } from "@/components/row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useDeleteStaffUser, useStaffUsers, type StaffUser } from "../api"
import { UserFormDialog } from "../components/user-form-dialog"

const NO_USERS: StaffUser[] = []

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

export function UsersPage() {
  const { data = NO_USERS, isLoading } = useStaffUsers()
  const remove = useDeleteStaffUser()

  const [editing, setEditing] = useState<StaffUser | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<StaffUser | null>(null)

  const columns = useMemo<DataTableColumn<StaffUser>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        cell: ({ row }) => (
          <div className="grid">
            <span className="font-medium">{row.original.full_name}</span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        ),
      },
      // accessorFn returns plain text so the search box can match branch and role names.
      {
        id: "branches",
        header: "Roles",
        accessorFn: (u) => u.roles.map((r) => `${r.role_name} ${r.branch_name ?? "All branches"}`).join(" "),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r.id} variant={r.branch ? "secondary" : "default"}>
                {r.role_name} · {r.branch_name ?? "All branches"}
              </Badge>
            ))}
          </div>
        ),
      },
      { accessorKey: "phone", header: "Phone", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "last_login",
        header: "Last login",
        sortFn: "datetime",
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return v ? dateFormat.format(new Date(v)) : <span className="text-muted-foreground">Never</span>
        },
      },
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
          <RowActions
            label={row.original.full_name}
            onEdit={() => {
              setEditing(row.original)
              setFormOpen(true)
            }}
            onDelete={() => setDeleting(row.original)}
          />
        ),
      },
    ],
    [],
  )

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success("User deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts and the branches they can work in."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <PlusIcon />
            New user
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowId={(u) => String(u.id)}
        searchPlaceholder="Search name, email, branch…"
        emptyMessage="No staff yet. Add your first user."
      />

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.full_name}?`}
        description="They will be logged out and can't log in again. To keep their history, deactivate them instead."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}
