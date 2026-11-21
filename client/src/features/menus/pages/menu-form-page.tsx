import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { SelectField } from "@/components/select-field"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { MENU_ICON_NAMES, menuIcon } from "@/lib/icons"
import { useGetMenuQuery, useGetMenusQuery, useSaveMenuMutation, type Menu, type MenuInput } from "../api"

const EMPTY: MenuInput = {
  name: "",
  router_name: "",
  router_description: "",
  router_link: "",
  icon: "",
  parent: null,
  is_header: false,
  is_sub_header: false,
  sort_order: 1,
}

const ICON_OPTIONS = [
  { value: null, label: "No icon" },
  ...MENU_ICON_NAMES.map((name) => {
    const Icon = menuIcon(name)
    return { value: name, label: <><Icon />{name}</> }
  }),
]

/** One "Type" choice in the form; the API stores it as is_header / is_sub_header. */
type MenuType = "page" | "header" | "sub_header"

const TYPE_OPTIONS: { value: MenuType; label: string }[] = [
  { value: "page", label: "Page" },
  { value: "header", label: "Header" },
  { value: "sub_header", label: "Sub-header" },
]

const TYPE_HINTS: Record<MenuType, string> = {
  page: "Opens a page from the sidebar.",
  header: "Section title for the menus under it.",
  sub_header: "Collapsible group for the menus under it.",
}

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

  const [values, setValues] = useState<MenuInput>(() => {
    if (!menu) return EMPTY
    const { name, router_name, router_description, router_link, icon, parent, is_header, is_sub_header, sort_order } = menu
    return { name, router_name, router_description, router_link, icon, parent, is_header, is_sub_header, sort_order }
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof MenuInput>(key: K, value: MenuInput[K]) => setValues((v) => ({ ...v, [key]: value }))

  const type: MenuType = values.is_header ? "header" : values.is_sub_header ? "sub_header" : "page"
  const setType = (t: MenuType) =>
    setValues((v) => ({ ...v, is_header: t === "header", is_sub_header: t === "sub_header" }))
  const isPage = type === "page"

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
    // headers and sub-headers don't open a page
    const data = isPage ? values : { ...values, router_name: "", router_link: "", router_description: "" }
    try {
      await save({ id: menu?.id, data }).unwrap()
      await reload() // the owner gets the new permissions straight away
      toast.success(menu ? "Menu updated" : "Menu created")
      navigate("/menus")
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    }
  }

  const typeError = errors.is_header || errors.is_sub_header

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to menus" render={<Link to="/menus" />}>
          <ArrowLeftIcon />
        </Button>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{menu ? `Edit ${menu.name}` : "Create menu"}</h2>
          <p className="text-sm text-muted-foreground">
            {menu
              ? "Change how this menu shows in the sidebar."
              : "Add a menu to the sidebar. It gets a permission for every action."}
          </p>
        </div>
      </div>

      <Card>
        {/* the card spaces its direct children; the form sits in between, so it repeats that spacing */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-(--card-spacing)">
          <CardContent>
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Details</FieldLegend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={!!errors.name || undefined}>
                    <FieldLabel htmlFor="menu-name">
                      Name <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input id="menu-name" placeholder="e.g. Orders" autoFocus value={values.name}
                      aria-invalid={!!errors.name || undefined} onChange={(e) => set("name", e.target.value)} />
                    <FieldError>{errors.name}</FieldError>
                  </Field>

                  <Field data-invalid={!!typeError || undefined}>
                    <FieldLabel htmlFor="menu-type">Type</FieldLabel>
                    <SelectField id="menu-type" value={type} options={TYPE_OPTIONS}
                      onValueChange={(v) => setType((v ?? "page") as MenuType)} />
                    {typeError ? <FieldError>{typeError}</FieldError> : <FieldDescription>{TYPE_HINTS[type]}</FieldDescription>}
                  </Field>

                  <Field data-invalid={!!errors.parent || undefined}>
                    <FieldLabel htmlFor="menu-parent">Parent</FieldLabel>
                    <SelectField id="menu-parent" value={values.parent} options={parentOptions}
                      aria-invalid={!!errors.parent || undefined} onValueChange={(v) => set("parent", v)} />
                    <FieldError>{errors.parent}</FieldError>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="menu-icon">Icon</FieldLabel>
                    <SelectField id="menu-icon" value={values.icon || null} options={ICON_OPTIONS}
                      onValueChange={(v) => set("icon", v ?? "")} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="menu-sequence">Sequence</FieldLabel>
                    <Input id="menu-sequence" type="number" min={0} value={values.sort_order}
                      onChange={(e) => set("sort_order", Math.max(0, Number(e.target.value) || 0))} />
                    <FieldDescription>Lower numbers come first.</FieldDescription>
                  </Field>
                </div>
              </FieldSet>

              {isPage && (
                <>
                  <FieldSeparator />
                  <FieldSet>
                    <FieldLegend>Route</FieldLegend>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field data-invalid={!!errors.router_name || undefined}>
                        <FieldLabel htmlFor="menu-router">
                          Router name <span className="text-destructive">*</span>
                        </FieldLabel>
                        <Input id="menu-router" placeholder="e.g. orders" value={values.router_name}
                          aria-invalid={!!errors.router_name || undefined}
                          onChange={(e) => set("router_name", e.target.value)} />
                        <FieldError>{errors.router_name}</FieldError>
                      </Field>

                      <Field data-invalid={!!errors.router_link || undefined}>
                        <FieldLabel htmlFor="menu-link">
                          Router link <span className="text-destructive">*</span>
                        </FieldLabel>
                        <Input id="menu-link" placeholder="/orders" value={values.router_link}
                          aria-invalid={!!errors.router_link || undefined}
                          onChange={(e) => set("router_link", e.target.value)} />
                        {errors.router_link ? (
                          <FieldError>{errors.router_link}</FieldError>
                        ) : (
                          <FieldDescription>Pages under it, like /orders/new, belong to this menu.</FieldDescription>
                        )}
                      </Field>

                      <Field data-invalid={!!errors.router_description || undefined} className="sm:col-span-2">
                        <FieldLabel htmlFor="menu-router-description">Router description</FieldLabel>
                        <Input id="menu-router-description" placeholder="What this page is for"
                          value={values.router_description}
                          onChange={(e) => set("router_description", e.target.value)} />
                        <FieldError>{errors.router_description}</FieldError>
                      </Field>
                    </div>
                  </FieldSet>
                </>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t">
            <Button type="button" variant="outline" render={<Link to="/menus" />}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {menu ? "Save changes" : "Create menu"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
