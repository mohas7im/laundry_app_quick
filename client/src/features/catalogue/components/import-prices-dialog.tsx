import { useRef, useState } from "react"
import { CircleAlertIcon, FileUpIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { SelectField } from "@/components/select-field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { importPriceList } from "../services/catalogue.service"
import type { ImportResult, ImportSection, PriceList } from "../types"

const MAX_BYTES = 1024 * 1024

/**
 * Import a price list CSV (columns: section, product, price_aed, express_price_aed,
 * pieces, active). Sections become services; "online" sections go to the Online price
 * list. First a preview, then the import; every change lands in the price history.
 */
export function ImportPricesDialog({
  open,
  onOpenChange,
  lists,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: PriceList[]
  onImported: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {open && <ImportForm lists={lists} onDone={() => onOpenChange(false)} onImported={onImported} />}
      </DialogContent>
    </Dialog>
  )
}

function ImportForm({ lists, onDone, onImported }: { lists: PriceList[]; onDone: () => void; onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [csv, setCsv] = useState("")
  const [sections, setSections] = useState<ImportSection[]>([])
  const [mainList, setMainList] = useState(lists.find((l) => l.is_default)?.id ?? "")
  const [onlineName, setOnlineName] = useState(lists.find((l) => /online/i.test(l.name))?.name ?? "Online")
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  async function run(text: string, commit: boolean, mapping = sections) {
    setBusy(commit ? "import" : "preview")
    setFileError(null)
    try {
      const res = await importPriceList({
        csv: text,
        commit,
        sections: mapping.map(({ section, service, price_list }) => ({ section, service, price_list })),
        main_price_list: mainList || null,
        online_price_list: onlineName.trim() || "Online",
      })
      setResult(res)
      if (!mapping.length) setSections(res.sections)
      if (res.imported) {
        const p = res.summary.prices
        toast.success(
          `Price list imported: ${p.main.new + p.online.new} new and ${p.main.changed + p.online.changed} changed prices`,
        )
        onImported()
        onDone()
      } else if (commit) {
        toast.error("Nothing was imported: fix the errors in the file first.")
      }
    } catch (err) {
      setFileError(getApiFieldErrors(err).csv ?? getApiErrorMessage(err, "Couldn't read the file."))
      setResult(null)
    } finally {
      setBusy(null)
    }
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setFileError("The file is larger than 1 MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      setFileName(file.name)
      setCsv(text)
      setSections([])
      void run(text, false, [])
    }
    reader.readAsText(file)
  }

  const updateSection = (section: string, patch: Partial<ImportSection>) => {
    setSections((list) => list.map((s) => (s.section === section ? { ...s, ...patch } : s)))
    setResult((r) => (r ? { ...r, errors: [] } : r)) // the counts are refreshed with "Check again"
  }

  const s = result?.summary
  const serviceNames = [...new Set(sections.map((x) => x.service))]

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Import a price list</DialogTitle>
        <DialogDescription>
          A CSV with the columns section, product, price_aed, express_price_aed, pieces, active. Each section
          becomes a service; online sections go to the online price list. You see what will change before
          anything is saved.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={!!busy}>
          <FileUpIcon data-icon="inline-start" />
          {fileName ? "Choose another file" : "Choose CSV file"}
        </Button>
        {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        {busy === "preview" && <Spinner />}
      </div>

      {fileError && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      {result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Normal sections go to</Label>
              <SelectField
                aria-label="Main price list"
                value={mainList}
                onValueChange={(v) => setMainList(v ?? "")}
                options={lists.map((l) => ({ value: l.id, label: l.is_default ? `${l.name} (default)` : l.name }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="online-list">Online sections go to</Label>
              <Input id="online-list" value={onlineName} onChange={(e) => setOnlineName(e.target.value)}
                placeholder="Online" />
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section in the file</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Price list</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map((x) => (
                  <TableRow key={x.section}>
                    <TableCell className="font-medium">{x.section}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.rows}</TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        list="import-services"
                        aria-label={`Service for ${x.section}`}
                        value={x.service}
                        onChange={(e) => updateSection(x.section, { service: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <SelectField
                        size="sm"
                        aria-label={`Price list for ${x.section}`}
                        value={x.price_list}
                        onValueChange={(v) => updateSection(x.section, { price_list: v === "online" ? "online" : "main" })}
                        options={[
                          { value: "main", label: "Normal" },
                          { value: "online", label: "Online" },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <datalist id="import-services">
              {serviceNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          {s && (
            <div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm">
              <span>
                {s.rows} rows{s.skipped_inactive > 0 && ` (${s.skipped_inactive} inactive rows skipped)`}.
              </span>
              <span>
                {s.new_services.length ? `New services: ${s.new_services.join(", ")}. ` : "No new services. "}
                {s.new_items} new items{s.items_pieces_changed > 0 && `, ${s.items_pieces_changed} with a new piece count`}.
              </span>
              <span>
                {s.main_price_list}: {s.prices.main.new} new, {s.prices.main.changed} changed, {s.prices.main.same} unchanged.
              </span>
              <span>
                {s.online_price_list}: {s.prices.online.new} new, {s.prices.online.changed} changed,{" "}
                {s.prices.online.same} unchanged.
              </span>
            </div>
          )}

          {result.errors.length > 0 && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Fix these first ({result.errors.length})</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {result.errors.slice(0, 15).map((e, i) => (
                    <li key={i}>{e.line ? `Line ${e.line}: ` : ""}{e.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {result.warnings.length > 0 && (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>Skipped rows ({result.warnings.length})</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {result.warnings.slice(0, 15).map((w, i) => (
                    <li key={i}>{w.line ? `Line ${w.line}: ` : ""}{w.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        {result && (
          <Button type="button" variant="outline" disabled={!!busy} onClick={() => void run(csv, false)}>
            {busy === "preview" && <Spinner data-icon="inline-start" />}
            Check again
          </Button>
        )}
        <Button type="button" disabled={!result || !!busy || result.errors.length > 0} onClick={() => void run(csv, true)}>
          {busy === "import" && <Spinner data-icon="inline-start" />}
          Import
        </Button>
      </DialogFooter>
    </div>
  )
}
