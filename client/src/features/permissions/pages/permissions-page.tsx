import { useMemo, useState } from "react"
import { Navigate, useBlocker, useNavigate, useParams } from "react-router"
import { InfoIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/select-field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { OWNER_ROLE, useGetRolesQuery, type Role } from "@/features/roles/api"
import { useGetPermissionMatrixQuery, useGetRolePermissionsQuery, useSaveRolePermissionsMutation, type PermissionMatrix } from "../api"

/** /permissions (first role) and /permissions/:roleId — the Permissions menu. */
export function PermissionsPage() {
  const { roleId } = useParams()
  const roles = useGetRolesQuery()
  const matrix = useGetPermissionMatrixQuery()
  const rolePerms = useGetRolePermissionsQuery(roleId ?? "", { skip: !roleId })

  // /permissions → the first role
  if (!roleId) {
    if (roles.isLoading) return <Skeleton className="h-96 w-full" />
    const first = roles.data?.[0]
    if (first) return <Navigate to={`/permissions/${first.id}`} replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Permissions" description="Choose what people with each role can do on each menu." />

      {!roleId ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>Create a role on the Roles page first.</AlertDescription>
        </Alert>
      ) : matrix.isLoading || rolePerms.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : matrix.isError || rolePerms.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {getApiErrorMessage(matrix.error ?? rolePerms.error, "Couldn't load permissions.")}
          </AlertDescription>
        </Alert>
      ) : (
        // key: start fresh when the role or its saved permissions change
        <PermissionEditor
          key={`${roleId}:${rolePerms.fulfilledTimeStamp}`}
          role={rolePerms.data!.role}
          saved={rolePerms.data!.permissions}
          matrix={matrix.data!}
        />
      )}
    </div>
  )
}

type Row = PermissionMatrix["menus"][number]

function PermissionEditor({ role, saved, matrix }: { role: Role; saved: string[]; matrix: PermissionMatrix }) {
  const navigate = useNavigate()
  const roles = useGetRolesQuery()
  const [save, { isLoading: saving }] = useSaveRolePermissionsMutation()
  const { can, reload } = useAuth()

  const [selected, setSelected] = useState(() => new Set(saved))
  const [search, setSearch] = useState("")

  const isOwnerRole = role.name === OWNER_ROLE
  const readOnly = isOwnerRole || !can("permissions.edit")
  const allCodes = useMemo(() => matrix.menus.flatMap((m) => Object.values(m.permissions)), [matrix])
  const checked = isOwnerRole ? new Set(allCodes) : selected

  const savedSet = useMemo(() => new Set(saved), [saved])
  const dirty = !readOnly && (selected.size !== savedSet.size || [...selected].some((c) => !savedSet.has(c)))

  // Leaving with unsaved changes (Back, sidebar, or switching role) asks first.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  // Search: matching features, plus the menus above them (so the tree still reads).
  const visible = useMemo(() => filterRows(matrix.menus, search), [matrix, search])

  const toggle = (codes: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of codes) on ? next.add(c) : next.delete(c)
      return next
    })

  const state = (codes: string[]) => {
    const n = codes.filter((c) => checked.has(c)).length
    return { checked: n > 0 && n === codes.length, indeterminate: n > 0 && n < codes.length }
  }

  const columnCodes = (action: string) => visible.map((r) => r.permissions[action]).filter(Boolean)
  const rowCodes = (r: Row) => Object.values(r.permissions)
  const everyVisible = visible.flatMap(rowCodes)

  async function submit() {
    try {
      await save({ roleId: role.id, permissions: [...selected] }).unwrap()
      await reload() // in case you edited one of your own roles
      toast.success(`Permissions saved for ${role.name}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't save permissions."))
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Field className="sm:max-w-xs">
          <FieldLabel htmlFor="permission-role">Role</FieldLabel>
          <SelectField
            id="permission-role"
            value={role.id}
            onValueChange={(v) => v && navigate(`/permissions/${v}`)}
            options={(roles.data ?? [role]).map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Button onClick={submit} disabled={!dirty || saving}>
          {saving && <Spinner data-icon="inline-start" />}
          Submit
        </Button>
      </div>

      {readOnly && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            {isOwnerRole
              ? "The Owner role always has every permission."
              : "You can see this role's permissions but not change them."}
          </AlertDescription>
        </Alert>
      )}

      <div className="relative w-full sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search menus…"
          aria-label="Search menus"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="min-w-56">
                <HeaderCheck
                  label="Menu"
                  {...state(everyVisible)}
                  disabled={readOnly || !everyVisible.length}
                  onChange={(on) => toggle(everyVisible, on)}
                />
              </TableHead>
              {matrix.actions.map((a) => (
                <TableHead key={a.code} className="min-w-28">
                  <HeaderCheck
                    label={a.name}
                    {...state(columnCodes(a.code))}
                    disabled={readOnly || !columnCodes(a.code).length}
                    onChange={(on) => toggle(columnCodes(a.code), on)}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={matrix.actions.length + 1} className="h-24 text-center text-muted-foreground">
                  No features match “{search}”.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => {
                const indent = { paddingLeft: `${0.5 + row.depth * 1.5}rem` }
                const codes = rowCodes(row)
                return (
                  <TableRow key={row.id}>
                    <TableCell style={indent}>
                      <HeaderCheck
                        label={row.name}
                        {...state(codes)}
                        disabled={readOnly}
                        onChange={(on) => toggle(codes, on)}
                      />
                    </TableCell>
                    {matrix.actions.map((a) => {
                      const code = row.permissions[a.code]
                      return (
                        <TableCell key={a.code}>
                          {code && (
                            <Checkbox
                              aria-label={`${a.name} ${row.name}`}
                              checked={checked.has(code)}
                              disabled={readOnly}
                              onCheckedChange={(on) => toggle([code], !!on)}
                            />
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.state === "blocked" && blocker.reset()}
        title="Discard unsaved changes?"
        description="Your changes to this role's permissions haven't been submitted."
        confirmLabel="Discard"
        destructive
        onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      />
    </>
  )
}

/** A checkbox with its label, used for select-all cells and row names. */
function HeaderCheck({
  label,
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  indeterminate: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="flex w-fit items-center gap-2 font-medium">
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        disabled={disabled}
        onCheckedChange={(on) => onChange(!!on)}
      />
      {label}
    </label>
  )
}

function filterRows(rows: Row[], search: string): Row[] {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  const keep = new Set<string>()
  rows.forEach((row, i) => {
    if (!row.name.toLowerCase().includes(q)) return
    keep.add(row.id)
    // keep the menus above it
    let depth = row.depth
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      if (rows[j]!.depth < depth) {
        keep.add(rows[j]!.id)
        depth = rows[j]!.depth
      }
    }
  })
  return rows.filter((r) => keep.has(r.id))
}
