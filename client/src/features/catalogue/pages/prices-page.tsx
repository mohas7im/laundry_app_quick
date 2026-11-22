import { useCallback, useMemo, useState } from "react"
import { Link, useBlocker, useLocation } from "react-router"
import { CircleAlertIcon, CircleDollarSignIcon, InfoIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { SelectField } from "@/components/select-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useRecords } from "@/lib/use-records"
import { getPriceGrid, getPriceLists, savePrices } from "../services/catalogue.service"
import type { PriceCell, PriceGrid, PriceList } from "../types"

/** Which value of each cell the grid shows and edits. */
type CellField = "price" | "express_price" | "min_price" | "extra_days"
type Draft = Record<CellField, string>

const FIELDS: { value: CellField; label: string; hint: string }[] = [
  {
    value: "price",
    label: "Price",
    hint: "The normal price, VAT included. Clear a price to stop offering that item for the service.",
  },
  {
    value: "express_price",
    label: "Express",
    hint: "The price when an order is express. Leave empty if the item has no express service.",
  },
  {
    value: "min_price",
    label: "Minimum",
    hint: "The least a line can cost, e.g. a 30 AED minimum on wash by kg.",
  },
  {
    value: "extra_days",
    label: "Extra days",
    hint: "Days added to the order's ready-by date when this item is in it.",
  },
]

const EMPTY_DRAFT: Draft = {
  price: "",
  express_price: "",
  min_price: "",
  extra_days: "",
}

const cellKey = (item: string, service: string) => `${item}:${service}`

const toDraft = (cell: PriceCell): Draft => ({
  price: cell.price ?? "",
  express_price: cell.express_price ?? "",
  min_price: cell.min_price ?? "",
  extra_days: cell.extra_days ? String(cell.extra_days) : "",
})

/** Without a price nothing else in the cell counts. */
const effective = (d: Draft): Draft => (d.price.trim() === "" ? EMPTY_DRAFT : d)

const sameValue = (a: string, b: string) => {
  const x = a.trim()
  const y = b.trim()
  return x === y || (x !== "" && y !== "" && Number(x) === Number(y))
}

const sameDraft = (a: Draft, b: Draft) => (Object.keys(EMPTY_DRAFT) as CellField[]).every((f) => sameValue(a[f], b[f]))

/** Prices menu: one price list as an items × services grid. */
export function PricesPage() {
  const location = useLocation()
  const priceLists = useRecords(getPriceLists, [] as PriceList[])
  // "View prices" on the Price Lists page passes the list in router state (no id in the URL)
  const [chosenId, setChosenId] = useState<string | null>(
    () => (location.state as { priceListId?: string } | null)?.priceListId ?? null,
  )

  const lists = priceLists.data
  const selected = lists.find((l) => l.id === chosenId) ?? lists.find((l) => l.is_default) ?? lists[0]

  return (
    <>
      <PageHeader title="Prices" description="What each item costs for each service. Prices include VAT." />

      {priceLists.loading ? (
        <LoadingState />
      ) : priceLists.error ? (
        <ErrorState error={priceLists.error} onRetry={priceLists.retry} />
      ) : !selected ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleDollarSignIcon />
            </EmptyMedia>
            <EmptyTitle>No price lists yet</EmptyTitle>
            <EmptyDescription>Create a price list first, e.g. Walk-in. Then set its prices here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/price-lists" />}>
              Go to Price Lists
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PriceGridEditor key={selected.id} priceList={selected} lists={lists} onSelectList={setChosenId} />
      )}
    </>
  )
}

function PriceGridEditor({
  priceList,
  lists,
  onSelectList,
}: {
  priceList: PriceList
  lists: PriceList[]
  onSelectList: (id: string) => void
}) {
  const { can } = useAuth()
  const readOnly = !can("prices.edit")

  const fetchGrid = useCallback(() => getPriceGrid(priceList.id), [priceList.id])
  const grid = useRecords(fetchGrid, null as PriceGrid | null)

  const [field, setField] = useState<CellField>("price")
  const [edits, setEdits] = useState<Record<string, Draft>>({})
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)

  const saved = useMemo(() => {
    const byKey: Record<string, Draft> = {}
    for (const cell of grid.data?.prices ?? []) byKey[cellKey(cell.item, cell.service)] = toDraft(cell)
    return byKey
  }, [grid.data])

  const draftOf = (key: string) => edits[key] ?? saved[key] ?? EMPTY_DRAFT
  const changed = useMemo(
    () =>
      new Set(
        Object.keys(edits).filter((key) => !sameDraft(effective(edits[key]!), effective(saved[key] ?? EMPTY_DRAFT))),
      ),
    [edits, saved],
  )
  const dirty = changed.size > 0

  // Leaving with unsaved prices (sidebar, Back) asks first.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  const items = useMemo(() => {
    const term = search.trim().toLowerCase()
    const all = grid.data?.items ?? []
    return term ? all.filter((i) => i.name.toLowerCase().includes(term)) : all
  }, [grid.data, search])

  function setCell(key: string, value: string) {
    setEdits((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? saved[key] ?? EMPTY_DRAFT), [field]: value },
    }))
  }

  async function save() {
    if (!dirty || saving) return
    const cells: PriceCell[] = [...changed].map((key) => {
      const [item, service] = key.split(":") as [string, string]
      const d = effective(edits[key]!)
      return {
        item,
        service,
        price: d.price.trim() === "" ? null : d.price.trim(),
        express_price: d.express_price.trim() || null,
        min_price: d.min_price.trim() || null,
        extra_days: d.extra_days.trim() === "" ? 0 : Number(d.extra_days),
      }
    })
    setSaving(true)
    try {
      grid.setData(await savePrices(priceList.id, cells))
      setEdits({})
      toast.success(`Prices saved for ${priceList.name}`)
    } catch (err) {
      const fieldError = Object.values(getApiFieldErrors(err))[0]
      toast.error(fieldError ?? getApiErrorMessage(err, "Couldn't save the prices."))
    } finally {
      setSaving(false)
    }
  }

  const hint = FIELDS.find((f) => f.value === field)!.hint

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Field className="sm:max-w-xs">
          <FieldLabel htmlFor="price-list">Price list</FieldLabel>
          <SelectField
            id="price-list"
            value={priceList.id}
            disabled={dirty}
            onValueChange={(v) => v && onSelectList(v)}
            options={lists.map((l) => ({
              value: l.id,
              label: l.is_default ? `${l.name} (default)` : l.name,
            }))}
          />
          {dirty && <FieldDescription>Save or discard your changes to switch lists.</FieldDescription>}
        </Field>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-sm text-muted-foreground">
                {changed.size} unsaved {changed.size === 1 ? "change" : "changes"}
              </span>
            )}
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setEdits({})}>
              Discard
            </Button>
            <Button disabled={!dirty || saving} onClick={save}>
              {saving && <Spinner data-icon="inline-start" />}
              Save prices
            </Button>
          </div>
        )}
      </div>

      {readOnly && (
        <Alert>
          <InfoIcon />
          <AlertDescription>You can see the prices but not change them.</AlertDescription>
        </Alert>
      )}

      {grid.loading ? (
        <LoadingState />
      ) : grid.error || !grid.data ? (
        <ErrorState error={grid.error} onRetry={grid.retry} />
      ) : !grid.data.services.length || !grid.data.items.length ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleDollarSignIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing to price yet</EmptyTitle>
            <EmptyDescription>
              {!grid.data.services.length && !grid.data.items.length
                ? "Add your services and items first."
                : !grid.data.services.length
                  ? "Add your services first, e.g. Dry Clean."
                  : "Add your items first, e.g. Kandura."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            {!grid.data.services.length && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/services" />}>
                Go to Services
              </Button>
            )}
            {!grid.data.items.length && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/items" />}>
                Go to Items
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={field} onValueChange={(v) => setField(v as CellField)}>
              <TabsList>
                {FIELDS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value}>
                    {f.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search items…"
                aria-label="Search items"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{hint}</p>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-48 bg-muted">Item</TableHead>
                  {grid.data.services.map((s) => (
                    <TableHead key={s.id} className="min-w-32 text-right">
                      {s.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length ? (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <div className="grid">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.category_name} · {item.pricing_type_name}
                          </span>
                        </div>
                      </TableCell>
                      {grid.data!.services.map((service) => {
                        const key = cellKey(item.id, service.id)
                        const draft = draftOf(key)
                        const offered = draft.price.trim() !== ""
                        // express, minimum and extra days need a price first
                        const disabled = readOnly || (field !== "price" && !offered)
                        return (
                          <TableCell key={service.id} className={changed.has(key) ? "bg-primary/5" : undefined}>
                            <div className="flex justify-end">
                              <Input
                                type="number"
                                inputMode={field === "extra_days" ? "numeric" : "decimal"}
                                min={0}
                                step={field === "extra_days" ? 1 : 0.01}
                                aria-label={`${FIELDS.find((f) => f.value === field)!.label}: ${item.name}, ${service.name}`}
                                className="h-8 w-24 text-right tabular-nums"
                                placeholder="—"
                                disabled={disabled}
                                value={field === "price" || offered ? draft[field] : ""}
                                onChange={(e) => setCell(key, e.target.value)}
                              />
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={grid.data.services.length + 1}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No items match “{search.trim()}”.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.state === "blocked" && blocker.reset()}
        title="Discard unsaved prices?"
        description={`Your changes to ${priceList.name} haven't been saved.`}
        confirmLabel="Discard"
        destructive
        onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      />
    </>
  )
}

function LoadingState() {
  return (
    <div className="flex h-40 items-center justify-center gap-2 rounded-lg border text-muted-foreground">
      <Spinner />
      Loading…
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Empty className="rounded-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>Couldn't load the prices</EmptyTitle>
        <EmptyDescription>{getApiErrorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  )
}
