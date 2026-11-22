import { useCallback, useMemo, useState } from "react"
import { InfoIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RowActionButtons } from "@/components/row-action-buttons"
import { SelectField } from "@/components/select-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useRecords } from "@/lib/use-records"
import { MasterFormDialog } from "../components/master-form-dialog"
import { deleteMaster, getMasters, getMasterTypes } from "../services/masters.service"
import type { CommonMaster, CommonMasterType } from "../types"

/** Administration → Common Masters: the lookup lists (item categories, payment methods …). */
export function CommonMastersPage() {
  const types = useRecords(getMasterTypes, [] as CommonMasterType[])
  const [typeCode, setTypeCode] = useState<string | null>(null)
  const selected = types.data.find((t) => t.code === typeCode) ?? types.data[0]

  return (
    <>
      <PageHeader title="Common Masters" description="The lists used across the app. Pick a list to manage its values." />

      {types.loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          Loading…
        </div>
      ) : types.error ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(types.error)}</p>
      ) : selected ? (
        <>
          <Field className="sm:max-w-sm">
            <FieldLabel htmlFor="master-type">List</FieldLabel>
            <SelectField
              id="master-type"
              value={selected.code}
              onValueChange={(v) => v && setTypeCode(v)}
              options={types.data.map((t) => ({ value: t.code, label: t.name }))}
            />
            <FieldDescription>{selected.description}</FieldDescription>
          </Field>
          <MasterValues key={selected.code} type={selected} />
        </>
      ) : null}
    </>
  )
}

function MasterValues({ type }: { type: CommonMasterType }) {
  const fetchValues = useCallback(() => getMasters(type.code), [type.code])
  const values = useRecords(fetchValues, [] as CommonMaster[])
  const { can } = useAuth()
  const canEdit = can("common_masters.edit")
  const canDelete = can("common_masters.delete") && !type.is_fixed

  const [editing, setEditing] = useState<CommonMaster | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<CommonMaster | null>(null)
  const [removing, setRemoving] = useState(false)

  const columns = useMemo<DataTableColumn<CommonMaster>[]>(
    () => [
      { accessorKey: "name", header: "Name", cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span>,
      },
      { accessorKey: "sort_order", header: "Sequence" },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) =>
          row.original.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Hidden</Badge>,
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
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await deleteMaster(deleting.id)
      toast.success("Value deleted")
      values.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setRemoving(false)
      setDeleting(null)
    }
  }

  return (
    <>
      {type.is_fixed && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            The app works out prices and payments from these values, so you can rename, reorder or hide them, but not
            add or delete them.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={values.data}
        isLoading={values.loading}
        error={values.error}
        onRetry={values.retry}
        getRowId={(m) => m.id}
        searchPlaceholder={`Search ${type.name.toLowerCase()}…`}
        emptyTitle="No values yet"
        emptyMessage="Add the first value to this list."
        toolbar={
          can("common_masters.create") &&
          !type.is_fixed && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New value
            </Button>
          )
        }
      />

      <MasterFormDialog open={formOpen} onOpenChange={setFormOpen} type={type} master={editing} onSaved={values.reload} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Values still used by other records can't be deleted. Hide them instead."
        confirmLabel="Delete"
        destructive
        pending={removing}
        onConfirm={confirmDelete}
      />
    </>
  )
}
