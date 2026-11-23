import { useEffect, useRef, useState } from "react"
import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { CustomerFormDialog } from "@/features/customers/components/customer-form-dialog"
import { searchCustomers } from "@/features/customers/services/customer.service"
import type { Customer } from "@/features/customers/types"

/**
 * Phone-first customer search for the counter: type a name or phone (the last 4 digits
 * are enough), pick a match, or add a new customer without leaving the order.
 */
export function CustomerPicker({
  value,
  onChange,
  canCreate,
  invalid,
}: {
  value: Customer | null
  onChange: (customer: Customer | null) => void
  canCreate: boolean
  invalid?: boolean
}) {
  const [term, setTerm] = useState("")
  const [results, setResults] = useState<Customer[]>([])
  const [searching, setSearching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const latest = useRef(0)

  // search 250 ms after typing stops; only the newest answer counts
  useEffect(() => {
    const query = term.trim()
    if (query.length < 2) return
    const request = ++latest.current
    const timer = setTimeout(() => {
      searchCustomers(query)
        .then((found) => request === latest.current && setResults(found))
        .catch(() => request === latest.current && setResults([]))
        .finally(() => request === latest.current && setSearching(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [term])

  function type(next: string) {
    setTerm(next)
    if (next.trim().length < 2) {
      latest.current++
      setResults([])
      setSearching(false)
    } else {
      setSearching(true)
    }
  }

  function pick(customer: Customer) {
    onChange(customer)
    setTerm("")
    setResults([])
  }

  if (value) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">{value.name}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{value.phone}</span>
          {value.preferences_text && <span className="text-xs">{value.preferences_text}</span>}
          {value.notes && <span className="text-xs text-muted-foreground">Note: {value.notes}</span>}
          {(value.price_list || Number(value.discount_percent) > 0) && (
            <span className="text-xs text-muted-foreground">
              {[
                value.price_list && `${value.price_list_name} prices`,
                Number(value.discount_percent) > 0 && `${Number(value.discount_percent)}% discount`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Change customer" onClick={() => onChange(null)}>
          <XIcon />
        </Button>
      </div>
    )
  }

  const query = term.trim()

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Phone or name…"
            aria-label="Find customer"
            aria-invalid={invalid || undefined}
            value={term}
            onChange={(e) => type(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                e.preventDefault()
                pick(results[0])
              }
            }}
          />
        </div>
        {canCreate && (
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <UserPlusIcon data-icon="inline-start" />
            New
          </Button>
        )}
      </div>

      {query.length >= 2 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {searching && !results.length ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Spinner />
              Searching…
            </div>
          ) : results.length ? (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground tabular-nums">{c.phone}</span>
              </button>
            ))
          ) : (
            <div className="p-3 text-sm text-muted-foreground">
              No customer matches “{query}”.{canCreate && " Add them with New."}
            </div>
          )}
        </div>
      )}

      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={pick} />
    </div>
  )
}
