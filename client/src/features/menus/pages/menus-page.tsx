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
import { menuIcon } from "@/lib/icons"
import { useDeleteMenuMutation, useGetMenusQuery, type Menu } from "../api"

const NO_MENUS: Menu[] = []
const yesNo = (v: boolean) => (v ? "Yes" : "No")

/** The feature list: every menu, in tree order (sortable by any column). */
export function MenusPage() {
  const navigate = useNavigate()
  const { data = NO_MENUS, isLoading } = useGetMenusQuery()
  const [remove, { isLoading: removing }] = useDeleteMenuMutation()
  const { can, reload } = useAuth()
  const [deleting, setDeleting] = useState<Menu | null>(null)

  const canEdit = can("menus.edit")
  const canDelete = can("menus.delete")

  const columns = useMemo<DataTableColumn<Menu>[]>(() => {
    const names = new Map(data.map((m) => [m.id, m.name]))
    return [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const m = row.original
          return (
            <span className="flex items-center gap-2" style={{ paddingLeft: `${(m.depth ?? 0) * 1.25}rem` }}>
              <span className="font-medium">{m.name}</span>
              {m.is_system && <Badge variant="outline">Built-in</Badge>}
              {!m.is_active && <Badge variant="secondary">Hidden</Badge>}
            </span>
          )
        },
      },
      { accessorKey: "code", header: "Code" },
      { accessorKey: "router_name", header: "Router" },
      { accessorKey: "router_description", header: "Description" },
      {
        accessorKey: "router_link",
        header: "Router link",
        cell: ({ getValue }) => (getValue() ? <code className="text-xs">{getValue() as string}</code> : "—"),
      },
      { accessorKey: "sort_order", header: "Sequence" },
      {
        accessorKey: "icon",
        header: "Icon",
        cell: ({ row }) => {
          if (!row.original.icon) return "—"
          const Icon = menuIcon(row.original.icon)
          return (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-4" />
              {row.original.icon}
            </span>
          )
        },
      },
      {
        id: "parent",
        header: "Parent",
        accessorFn: (m) => (m.parent ? (names.get(m.parent) ?? "") : ""),
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      { id: "is_header", header: "Header", accessorFn: (m) => yesNo(m.is_header) },
      { id: "is_sub_header", header: "Sub header", accessorFn: (m) => yesNo(m.is_sub_header) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionButtons
            label={row.original.name}
            onEdit={canEdit ? () => navigate(`/menus/${row.original.id}/edit`) : undefined}
            onDelete={canDelete && !row.original.is_system ? () => setDeleting(row.original) : undefined}
          />
        ),
      },
    ]
  }, [data, canEdit, canDelete, navigate])

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove(deleting.id).unwrap()
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
      <PageHeader title="Menus" description="Every feature in the app. Each one has a permission for every action." />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowId={(m) => m.id}
        searchPlaceholder="Search menus…"
        emptyMessage="No menus yet."
        toolbar={
          can("menus.create") && (
            <Button onClick={() => navigate("/menus/new")}>
              <PlusIcon data-icon="inline-start" />
              New menu
            </Button>
          )
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Its permissions are deleted too and removed from every role. This can't be undone."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
