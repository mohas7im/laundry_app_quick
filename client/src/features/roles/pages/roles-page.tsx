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
import { useDeleteRole, usePermissionGroups, useRoles, type Role } from "../api"
import { RoleFormDialog } from "../components/role-form-dialog"

const NO_ROLES: Role[] = []

export function RolesPage() {
  const { data = NO_ROLES, isLoading } = useRoles()
  const groups = usePermissionGroups()
  const remove = useDeleteRole()

  const [editing, setEditing] = useState<Role | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Role | null>(null)

  const totalPermissions = groups.data?.reduce((n, g) => n + g.permissions.length, 0)

  const columns = useMemo<DataTableColumn<Role>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Role",
        cell: ({ row }) => (
          <div className="grid">
            <span className="font-medium">{row.original.name}</span>
            {row.original.description && (
              <span className="text-xs text-muted-foreground">{row.original.description}</span>
            )}
          </div>
        ),
      },
      {
        id: "permissions",
        header: "Permissions",
        accessorFn: (r) => r.permissions.length,
        cell: ({ row }) => {
          const n = row.original.permissions.length
          if (n === 0) return <Badge variant="outline">None</Badge>
          if (totalPermissions && n === totalPermissions) return <Badge>All permissions</Badge>
          return <Badge variant="secondary">{n} permissions</Badge>
        },
      },
      { accessorKey: "user_count", header: "Users" },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            onEdit={() => {
              setEditing(row.original)
              setFormOpen(true)
            }}
            onDelete={() => setDeleting(row.original)}
          />
        ),
      },
    ],
    [totalPermissions],
  )

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success("Role deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Roles are shared by all branches. Each user gets a role per branch."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <PlusIcon />
            New role
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowId={(r) => String(r.id)}
        searchPlaceholder="Search roles…"
        emptyMessage="No roles yet. Create one, e.g. Cashier or Manager."
      />

      <RoleFormDialog open={formOpen} onOpenChange={setFormOpen} role={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This can't be undone. Roles assigned to users can't be deleted."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}
