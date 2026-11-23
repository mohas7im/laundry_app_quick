import { useCallback } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getApiErrorMessage } from "@/lib/api/errors"
import { formatMoney, shopDateFormat } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { getPriceHistory } from "../services/catalogue.service"
import type { PriceChange } from "../types"

const when = shopDateFormat({ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })

/** The latest price changes of a price list: who changed what, when, and from where. */
export function PriceHistoryDialog({
  priceList,
  open,
  onOpenChange,
}: {
  priceList: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Price history · {priceList.name}</DialogTitle>
          <DialogDescription>The latest 200 changes, newest first.</DialogDescription>
        </DialogHeader>
        {open && <History priceListId={priceList.id} />}
      </DialogContent>
    </Dialog>
  )
}

function money(value: string | null) {
  return value === null ? "—" : formatMoney(value)
}

function History({ priceListId }: { priceListId: string }) {
  const fetch = useCallback(() => getPriceHistory(priceListId), [priceListId])
  const history = useRecords(fetch, [] as PriceChange[])

  if (history.loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    )
  }
  if (history.error) return <p className="text-sm text-destructive">{getApiErrorMessage(history.error)}</p>
  if (!history.data.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No price changes recorded yet.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Item</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Express</TableHead>
          <TableHead>By</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.data.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="whitespace-nowrap">{when.format(new Date(c.changed_at))}</TableCell>
            <TableCell>
              <div className="grid">
                <span>{c.item_name}</span>
                <span className="text-xs text-muted-foreground">{c.service_name}</span>
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {c.old_price === null ? (
                <span>New · {money(c.new_price)}</span>
              ) : c.new_price === null ? (
                <span className="text-destructive">Removed (was {money(c.old_price)})</span>
              ) : (
                <span>
                  {money(c.old_price)} → {money(c.new_price)}
                </span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {c.old_express_price === c.new_express_price
                ? money(c.new_express_price)
                : `${money(c.old_express_price)} → ${money(c.new_express_price)}`}
            </TableCell>
            <TableCell>
              <div className="grid">
                <span>{c.changed_by_name || "—"}</span>
                <span className="text-xs text-muted-foreground">{c.source_name}</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
