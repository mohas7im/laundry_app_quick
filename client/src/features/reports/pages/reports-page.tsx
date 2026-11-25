import { useCallback, useState } from "react"
import { DownloadIcon, PrinterIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fromCents, toCents } from "@/features/orders/lib/pricing"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { formatMoney, shopDateFormat, shopNow } from "@/lib/format"
import { useRecords } from "@/lib/use-records"
import { downloadOrdersCsv, getDailySummary } from "../services/reports.service"
import type { DailySummary } from "../types"

const longDay = shopDateFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" })
const time = shopDateFormat({ hour: "numeric", minute: "2-digit" })

const today = () => shopNow().toISOString().slice(0, 10)

/** Reports: the end-of-day summary (printable on A4) and the orders export. */
export function ReportsPage() {
  const { can } = useAuth()
  const [date, setDate] = useState(today)
  const fetchSummary = useCallback(() => getDailySummary(date), [date])
  const summary = useRecords(fetchSummary, null as DailySummary | null)

  return (
    <>
      <PageHeader
        title="Reports"
        description="Daily summary and reports for this branch."
        actions={
          <Button variant="outline" disabled={!summary.data} onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            Print summary
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <Field className="max-w-48">
          <FieldLabel htmlFor="report-date">Day</FieldLabel>
          <Input id="report-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
      </div>

      {summary.loading ? (
        <div className="flex h-40 items-center justify-center gap-2 rounded-lg border text-muted-foreground">
          <Spinner />
          Loading…
        </div>
      ) : summary.error || !summary.data ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(summary.error)}</p>
      ) : (
        <DailySummaryView s={summary.data} />
      )}

      {can("reports.print") && <ExportCard />}
    </>
  )
}

function DailySummaryView({ s }: { s: DailySummary }) {
  return (
    <article className="print-page grid gap-4 rounded-lg border bg-card p-5 text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
        <div>
          <h3 className="text-lg font-semibold">Daily summary</h3>
          <p className="text-muted-foreground">
            {s.branch_name} ({s.branch_code}) · {longDay.format(new Date(`${s.date}T12:00:00Z`))}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Prices include VAT</span>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="grid gap-1.5">
          <h4 className="font-medium">Sales</h4>
          <Row label="Orders taken" value={`${s.sales.orders}${s.sales.express_orders ? ` (${s.sales.express_orders} express)` : ""}`} />
          <Row label="Pieces" value={String(s.sales.pieces)} />
          <Row label="Before discounts" value={formatMoney(s.sales.subtotal)} />
          <Row label="Discounts" value={`− ${formatMoney(s.sales.discounts)}`} />
          <Row label="Sales (VAT included)" value={formatMoney(s.sales.sales)} strong />
          <Row label="VAT" value={formatMoney(s.sales.vat)} />
          <Row label="Sales without VAT" value={formatMoney(s.sales.sales_excl_vat)} />
          <Row label="Average order" value={formatMoney(s.sales.average_order)} />
          <Row
            label="Ready on time"
            value={s.on_time.percent === null ? "—" : `${s.on_time.percent}% (${s.on_time.on_time} of ${s.on_time.ready})`}
          />
        </section>

        <section className="grid content-start gap-1.5">
          <h4 className="font-medium">Money received</h4>
          {s.collected.methods.length ? (
            s.collected.methods.map((m) => (
              <Row
                key={m.method}
                label={`${m.method_name}${toCents(m.refunded) ? ` (−${formatMoney(m.refunded)} refunded)` : ""}`}
                value={formatMoney(m.net)}
              />
            ))
          ) : (
            <p className="text-muted-foreground">No payments on this day.</p>
          )}
          <Row label="Refunds" value={`− ${formatMoney(s.collected.refunded)}`} />
          <Row label="Total received" value={formatMoney(s.collected.net)} strong />
        </section>
      </div>

      <section className="grid gap-2">
        <h4 className="font-medium">Cash-ups</h4>
        {s.cash_ups.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cashier</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Expected cash</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.cash_ups.map((c) => {
                const diff = toCents(c.difference ?? "0")
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.opened_by_name}</TableCell>
                    <TableCell>{c.closed_at ? time.format(new Date(c.closed_at)) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.expected_cash)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.counted_cash)}</TableCell>
                    <TableCell className="text-right">
                      {diff === 0 ? (
                        <Badge variant="secondary">Matches</Badge>
                      ) : diff < 0 ? (
                        <Badge variant="destructive">Short {formatMoney(fromCents(-diff))}</Badge>
                      ) : (
                        <Badge variant="outline">Over {formatMoney(fromCents(diff))}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground">No shift was closed on this day.</p>
        )}
      </section>

      {s.top_items.length > 0 && (
        <section className="grid gap-1.5">
          <h4 className="font-medium">Top items</h4>
          {s.top_items.map((item) => (
            <Row key={item.item_name} label={`${item.item_name} × ${item.quantity}`} value={formatMoney(item.sales)} />
          ))}
        </section>
      )}
    </article>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 tabular-nums ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function ExportCard() {
  const [from, setFrom] = useState(() => `${today().slice(0, 8)}01`) // first of this month
  const [to, setTo] = useState(today)
  const [downloading, setDownloading] = useState(false)

  async function download() {
    if (downloading) return
    setDownloading(true)
    try {
      await downloadOrdersCsv(from, to)
    } catch (err) {
      toast.error(Object.values(getApiFieldErrors(err))[0] ?? getApiErrorMessage(err, "Couldn't export the orders."))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Export orders</CardTitle>
        <CardDescription>Every order taken in these days, as a file that opens in Excel.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <Field className="max-w-44">
          <FieldLabel htmlFor="export-from">From</FieldLabel>
          <Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field className="max-w-44">
          <FieldLabel htmlFor="export-to">To</FieldLabel>
          <Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button disabled={!from || !to || downloading} onClick={() => void download()}>
          {downloading ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
          Download CSV
        </Button>
      </CardContent>
    </Card>
  )
}
