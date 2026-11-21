import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/auth-context"
import { MENU_ICON_NAMES, menuIcon } from "@/lib/icons"
import { useMenus, useSaveMenu, type Menu, type MenuInput } from "../api"

const STANDARD_ACTIONS = ["view", "create", "edit", "delete"] as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  menu?: Menu | null
}

export function MenuFormDialog({ open, onOpenChange, menu }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {open && <MenuForm key={menu?.id ?? "new"} menu={menu} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** "Customer Notes" → "customer_notes" */
function toCode(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function MenuForm({ menu, onDone }: { menu?: Menu | null; onDone: () => void }) {
  const save = useSaveMenu()
  const menus = useMenus()
  const { reload } = useAuth()
  const system = !!menu?.is_system

  const [values, setValues] = useState<MenuInput>({
    code: menu?.code ?? "",
    name: menu?.name ?? "",
    path: menu?.path ?? "",
    icon: menu?.icon ?? "",
    parent: menu?.parent ?? null,
    sort_order: menu?.sort_order ?? 0,
    is_active: menu?.is_active ?? true,
    actions: menu?.actions ?? ["view"],
  })
  const [codeTouched, setCodeTouched] = useState(!!menu)
  const [extra, setExtra] = useState(
    (menu?.actions ?? []).filter((a) => !(STANDARD_ACTIONS as readonly string[]).includes(a)).join(", "),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof MenuInput>(key: K, value: MenuInput[K]) => setValues((v) => ({ ...v, [key]: value }))

  // A menu can't go under itself or anything below it.
  const blocked = new Set<string>()
  if (menu) {
    blocked.add(menu.id)
    for (const m of menus.data ?? []) if (m.parent && blocked.has(m.parent)) blocked.add(m.id)
  }
  const parentOptions = (menus.data ?? []).filter((m) => !blocked.has(m.id))

  const savedActions = new Set(menu?.actions ?? [])
  const toggleAction = (action: string, on: boolean) =>
    set("actions", on ? [...new Set([...values.actions, action])] : values.actions.filter((a) => a !== action))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const extraActions = extra
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
    const actions = [
      ...values.actions.filter((a) => (STANDARD_ACTIONS as readonly string[]).includes(a)),
      ...extraActions,
    ]
    setErrors({})
    try {
      const { code, ...rest } = values
      await save.mutateAsync({ id: menu?.id, data: menu ? { ...rest, actions } : { code, ...rest, actions } })
      await reload() // the owner gets new permissions straight away
      toast.success(menu ? "Menu updated" : "Menu created")
      onDone()
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    }
  }

  const Icon = menuIcon(values.icon)

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <DialogHeader>
          <DialogTitle>{menu ? `Edit ${menu.name}` : "New menu"}</DialogTitle>
          <DialogDescription>
            Each action you tick becomes a permission you can give to roles, e.g.{" "}
            <code>{values.code || "orders"}.create</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor="menu-name">Name</FieldLabel>
            <Input
              id="menu-name"
              autoFocus
              value={values.name}
              aria-invalid={!!errors.name || undefined}
              onChange={(e) => {
                set("name", e.target.value)
                if (!codeTouched) set("code", toCode(e.target.value))
              }}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.code || undefined}>
            <FieldLabel htmlFor="menu-code">Code</FieldLabel>
            <Input
              id="menu-code"
              value={values.code}
              disabled={!!menu}
              aria-invalid={!!errors.code || undefined}
              onChange={(e) => {
                setCodeTouched(true)
                set("code", e.target.value)
              }}
            />
            {errors.code ? (
              <FieldError>{errors.code}</FieldError>
            ) : (
              <FieldDescription>{menu ? "Can't be changed." : "Lowercase, e.g. orders."}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!errors.path || undefined}>
            <FieldLabel htmlFor="menu-path">Page path</FieldLabel>
            <Input
              id="menu-path"
              placeholder="/orders"
              value={values.path}
              disabled={system}
              aria-invalid={!!errors.path || undefined}
              onChange={(e) => set("path", e.target.value)}
            />
            {errors.path ? (
              <FieldError>{errors.path}</FieldError>
            ) : (
              <FieldDescription>Leave empty for a heading that groups other menus.</FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="menu-icon">Icon</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border">
                <Icon className="size-4" />
              </span>
              <NativeSelect
                id="menu-icon"
                className="flex-1"
                value={values.icon}
                onChange={(e) => set("icon", e.target.value)}
              >
                <NativeSelectOption value="">No icon</NativeSelectOption>
                {MENU_ICON_NAMES.map((name) => (
                  <NativeSelectOption key={name} value={name}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </Field>
          <Field data-invalid={!!errors.parent || undefined}>
            <FieldLabel htmlFor="menu-parent">Under</FieldLabel>
            <NativeSelect
              id="menu-parent"
              value={values.parent ?? ""}
              onChange={(e) => set("parent", e.target.value || null)}
            >
              <NativeSelectOption value="">Top level</NativeSelectOption>
              {parentOptions.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {"— ".repeat(m.depth)}
                  {m.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errors.parent && <FieldError>{errors.parent}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="menu-order">Order</FieldLabel>
            <Input
              id="menu-order"
              type="number"
              min={0}
              value={values.sort_order}
              onChange={(e) => set("sort_order", Math.max(0, Number(e.target.value) || 0))}
            />
            <FieldDescription>Lower numbers come first.</FieldDescription>
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">Actions</FieldLegend>
          <FieldDescription>
            Unticking a saved action deletes its permission and removes it from every role.
          </FieldDescription>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {STANDARD_ACTIONS.map((action) => (
              <Field key={action} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`menu-action-${action}`}
                  checked={values.actions.includes(action)}
                  disabled={system && savedActions.has(action)}
                  onCheckedChange={(on) => toggleAction(action, !!on)}
                />
                <FieldLabel htmlFor={`menu-action-${action}`} className="capitalize">
                  {action}
                </FieldLabel>
              </Field>
            ))}
          </div>
          <Field data-invalid={!!errors.actions || undefined}>
            <FieldLabel htmlFor="menu-extra">Other actions</FieldLabel>
            <Input
              id="menu-extra"
              placeholder="e.g. refund, export"
              value={extra}
              aria-invalid={!!errors.actions || undefined}
              onChange={(e) => setExtra(e.target.value)}
            />
            {errors.actions ? (
              <FieldError>{errors.actions}</FieldError>
            ) : (
              <FieldDescription>Separate with commas. Lowercase and underscores.</FieldDescription>
            )}
          </Field>
        </FieldSet>

        <Field orientation="horizontal">
          <Switch id="menu-active" checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
          <FieldLabel htmlFor="menu-active">Show in the sidebar</FieldLabel>
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : menu ? "Save changes" : "Create menu"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
