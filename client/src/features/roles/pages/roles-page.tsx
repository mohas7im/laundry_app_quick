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
import { useDeleteRoleMutation, useGetRolesQuery, type Role } from "../api"
import { RoleFormDialog } from "../components/role-form-dialog"

const NO_ROLES: Role[] = []

export function RolesPage() {
  const navigate = useNavigate()
  const { data = NO_ROLES, isLoading } = useGetRolesQuery()
  const [remove, { isLoading: removing }] = useDeleteRoleMutation()
  const { can } = useAuth()
  const canEdit = can("roles.edit")
  const canDelete = can("roles.delete")
  const canViewPermissions = can("permissions.view")

  const [editing, setEditing] = useState<Role | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Role | null>(null)

  const columns = useMemo<DataTableColumn<Role>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.is_system_role && <Badge variant="outline">Built-in</Badge>}
          </span>
        ),
      },
      { accessorKey: "description", header: "Description", cell: ({ getValue }) => (getValue() as string) || "—" },
      { accessorKey: "permission_count", header: "Permissions" },
      { accessorKey: "user_count", header: "Users" },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionButtons
            label={row.original.name}
            onView={canViewPermissions ? () => navigate(`/permissions/${row.original.id}`) : undefined}
            onEdit={
              canEdit
                ? () => {
                    setEditing(row.original)
                    setFormOpen(true)
                  }
                : undefined
            }
            onDelete={canDelete && !row.original.is_system_role ? () => setDeleting(row.original) : undefined}
          />
        ),
      },
    ],
    [canEdit, canDelete, canViewPermissions, navigate],
  )

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove(deleting.id).unwrap()
      toast.success("Role deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader title="Roles" description="Create roles, then set what each one can do on the Permissions page." />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowId={(r) => r.id}
        searchPlaceholder="Search roles…"
        emptyMessage="No roles yet. Create one, e.g. Cashier or Manager."
        toolbar={
          can("roles.create") && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New role
            </Button>
          )
        }
      />

      <RoleFormDialog open={formOpen} onOpenChange={setFormOpen} role={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This can't be undone. Roles assigned to users can't be deleted."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
