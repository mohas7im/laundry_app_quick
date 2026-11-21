import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { SelectField } from "@/components/select-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { MENU_ICON_NAMES, menuIcon } from "@/lib/icons"
import { useGetMenuQuery, useGetMenusQuery, useSaveMenuMutation, type Menu, type MenuInput } from "../api"

const EMPTY: MenuInput = {
  name: "",
  code: "",
  router_name: "",
  router_description: "",
  router_link: "",
  icon: "",
  parent: null,
  is_header: false,
  is_sub_header: false,
  sort_order: 1,
  is_active: true,
}

const ICON_OPTIONS = [
  { value: null, label: "No icon" },
  ...MENU_ICON_NAMES.map((name) => {
    const Icon = menuIcon(name)
    return { value: name, label: <><Icon />{name}</> }
  }),
]

/** /menus/new and /menus/:id/edit */
export function MenuFormPage() {
  const { id } = useParams()
  const menu = useGetMenuQuery(id ?? "", { skip: !id })

  if (id && menu.isLoading) return <Skeleton className="h-96 w-full max-w-3xl" />
  if (id && menu.isError) {
    return <p className="text-sm text-destructive">{getApiErrorMessage(menu.error, "Couldn't load this menu.")}</p>
  }
  return <MenuForm key={id ?? "new"} menu={menu.data} />
}

function MenuForm({ menu }: { menu?: Menu }) {
  const navigate = useNavigate()
  const [save, { isLoading: saving }] = useSaveMenuMutation()
  const menus = useGetMenusQuery()
  const { reload } = useAuth()
  const system = !!menu?.is_system

  const [values, setValues] = useState<MenuInput>(menu ? { ...EMPTY, ...menu } : EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof MenuInput>(key: K, value: MenuInput[K]) => setValues((v) => ({ ...v, [key]: value }))
  // Headers and sub-headers group other menus; their router fields are optional.
  const isPage = !values.is_header && !values.is_sub_header

  // Parent: any menu except this one and the menus under it (no loops).
  const below = new Set<string>(menu ? [menu.id] : [])
  for (const m of menus.data ?? []) if (m.parent && below.has(m.parent)) below.add(m.id)
  const parentOptions = [
    { value: null, label: "None (top level)" },
    ...(menus.data ?? [])
      .filter((m) => !below.has(m.id))
      .map((m) => ({ value: m.id, label: `${"— ".repeat(m.depth ?? 0)}${m.name}` })),
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    const { code, ...rest } = values
    try {
      await save({ id: menu?.id, data: menu ? rest : { code, ...rest } }).unwrap()
      await reload() // the owner gets the new permissions straight away
      toast.success(menu ? "Menu updated" : "Menu created")
      navigate("/menus")
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" render={<Link to="/menus" />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Back
      </Button>

      <PageHeader
        title={menu ? `Edit ${menu.name}` : "Create menu"}
        description={
          system
            ? "Built-in menu: you can change its name, icon, parent, order and description."
            : "Add a menu to the sidebar. It gets a permission for every action."
        }
      />

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent>
            <FieldGroup>
              <Row id="menu-name" label="Name" required error={errors.name}>
                <Input id="menu-name" placeholder="e.g. Orders" autoFocus value={values.name}
                  aria-invalid={!!errors.name || undefined} onChange={(e) => set("name", e.target.value)} />
              </Row>

              <Row id="menu-code" label="Code" error={errors.code}
                description={menu ? "Can't be changed: permission codes are built from it." : "Leave empty to make it from the name."}>
                <Input id="menu-code" placeholder="e.g. orders" value={values.code} disabled={!!menu}
                  aria-invalid={!!errors.code || undefined} onChange={(e) => set("code", e.target.value)} />
              </Row>

              <Row id="menu-router" label="Router name" required={isPage} error={errors.router_name}>
                <Input id="menu-router" placeholder="e.g. orders" value={values.router_name} disabled={system}
                  aria-invalid={!!errors.router_name || undefined} onChange={(e) => set("router_name", e.target.value)} />
              </Row>

              <Row id="menu-router-description" label="Router description" error={errors.router_description}>
                <Input id="menu-router-description" placeholder="What this page is for" value={values.router_description}
                  onChange={(e) => set("router_description", e.target.value)} />
              </Row>

              <Row id="menu-link" label="Router link" required={isPage} error={errors.router_link}
                description="The page's path, e.g. /orders. Pages under it (/orders/new) belong to this menu.">
                <Input id="menu-link" placeholder="/orders" value={values.router_link} disabled={system}
                  aria-invalid={!!errors.router_link || undefined} onChange={(e) => set("router_link", e.target.value)} />
              </Row>

              <Row id="menu-icon" label="Icon">
                <SelectField id="menu-icon" value={values.icon || null} options={ICON_OPTIONS}
                  onValueChange={(v) => set("icon", v ?? "")} />
              </Row>

              <Row id="menu-parent" label="Parent" error={errors.parent}>
                <SelectField id="menu-parent" value={values.parent} options={parentOptions}
                  aria-invalid={!!errors.parent || undefined} onValueChange={(v) => set("parent", v)} />
              </Row>

              <Row id="menu-header" label="Is header" error={errors.is_header}
                description="Section title in the sidebar for the menus under it.">
                <YesNo id="menu-header" value={values.is_header} disabled={system}
                  onChange={(v) => setValues((s) => ({ ...s, is_header: v, is_sub_header: v ? false : s.is_sub_header }))} />
              </Row>

              <Row id="menu-sub-header" label="Is sub-header" error={errors.is_sub_header}
                description="Collapsible submenu for the menus under it.">
                <YesNo id="menu-sub-header" value={values.is_sub_header} disabled={system}
                  onChange={(v) => setValues((s) => ({ ...s, is_sub_header: v, is_header: v ? false : s.is_header }))} />
              </Row>

              <Row id="menu-sequence" label="Sequence" description="Lower numbers come first.">
                <Input id="menu-sequence" type="number" min={0} value={values.sort_order}
                  onChange={(e) => set("sort_order", Math.max(0, Number(e.target.value) || 0))} />
              </Row>

              <Row id="menu-active" label="Show in sidebar">
                <Switch id="menu-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
              </Row>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t">
            <Button type="button" variant="outline" render={<Link to="/menus" />}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : menu ? "Save changes" : "Create menu"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

/**
 * Label + help/error in a fixed left column, control in an even right column
 * (stacks on narrow screens), so every control lines up at the same width.
 */
function Row({
  id,
  label,
  required,
  description,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  description?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <Field
      data-invalid={!!error || undefined}
      className="grid gap-2 @md/field-group:grid-cols-[13rem_minmax(0,22rem)] @md/field-group:items-start @md/field-group:gap-6"
    >
      <FieldContent>
        <FieldLabel htmlFor={id}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
        {error && <FieldError>{error}</FieldError>}
      </FieldContent>
      <div>{children}</div>
    </Field>
  )
}

function YesNo({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string
  value: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <SelectField
      id={id}
      value={value ? "yes" : "no"}
      disabled={disabled}
      onValueChange={(v) => onChange(v === "yes")}
      options={[
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ]}
    />
  )
}
