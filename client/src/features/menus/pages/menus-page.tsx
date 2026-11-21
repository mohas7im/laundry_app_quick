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
import { useAuth } from "@/lib/auth/auth-context"
import { menuIcon } from "@/lib/icons"
import { useDeleteMenu, useMenus, type Menu } from "../api"
import { MenuFormDialog } from "../components/menu-form-dialog"

const NO_MENUS: Menu[] = []

export function MenusPage() {
  const { data = NO_MENUS, isLoading } = useMenus()
  const remove = useDeleteMenu()
  const { can, reload } = useAuth()

  const [editing, setEditing] = useState<Menu | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Menu | null>(null)

  const canEdit = can("menus.edit")
  const canDelete = can("menus.delete")

  const columns = useMemo<DataTableColumn<Menu>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Menu",
        enableSorting: false, // keep tree order
        cell: ({ row }) => {
          const m = row.original
          const Icon = menuIcon(m.icon)
          return (
            <div className="flex items-center gap-2" style={{ paddingLeft: `${m.depth * 1.5}rem` }}>
              <Icon className="size-4 text-muted-foreground" />
              <span className={m.path ? "font-medium" : "font-semibold uppercase tracking-wide text-muted-foreground"}>
                {m.name}
              </span>
              {m.is_system && <Badge variant="outline">Built-in</Badge>}
              {!m.is_active && <Badge variant="secondary">Hidden</Badge>}
            </div>
          )
        },
      },
      { accessorKey: "code", header: "Code", enableSorting: false },
      {
        accessorKey: "path",
        header: "Path",
        enableSorting: false,
        cell: ({ getValue }) => (getValue() as string) || <span className="text-muted-foreground">Heading</span>,
      },
      {
        id: "actions_list",
        header: "Actions",
        enableSorting: false,
        accessorFn: (m) => m.actions.join(" "),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.actions.map((a) => (
              <Badge key={a} variant="secondary" className="capitalize">
                {a}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Row actions</span>,
        enableSorting: false,
        cell: ({ row }) =>
          canEdit || canDelete ? (
            <RowActions
              label={row.original.name}
              onEdit={
                canEdit
                  ? () => {
                      setEditing(row.original)
                      setFormOpen(true)
                    }
                  : undefined
              }
              onDelete={canDelete && !row.original.is_system ? () => setDeleting(row.original) : undefined}
            />
          ) : null,
      },
    ],
    [canEdit, canDelete],
  )

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      await reload()
      toast.success("Menu deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Menus"
        description="Sidebar items and the actions people can be allowed to do on each. Give actions to roles on the Roles page."
        actions={
          can("menus.create") && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New menu
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowId={(m) => m.id}
        searchPlaceholder="Search menus…"
        emptyMessage="No menus yet."
      />

      <MenuFormDialog open={formOpen} onOpenChange={setFormOpen} menu={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Its permissions are deleted too and removed from every role. This can't be undone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}
