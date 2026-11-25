import { useRef, useState } from "react"
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { FormField } from "@/components/form-field"
import { PageHeader } from "@/components/page-header"
import { SelectField } from "@/components/select-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"
import { useRecords } from "@/lib/use-records"
import { getCompanySettings, saveCompanySettings } from "../services/company.service"
import type { CompanySettings, CompanySettingsRequest, InvoiceNumbering } from "../types"

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]
const LOGO_MAX_BYTES = 300 * 1024

/** Administration → Configuration: the business's name, logo, contact details and receipt terms. */
export function CompanySettingsPage() {
  const settings = useRecords(getCompanySettings, null as CompanySettings | null)

  return (
    <>
      <PageHeader title="Configuration" description="Your business details. They print on every receipt." />
      {settings.loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          Loading…
        </div>
      ) : settings.error || !settings.data ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(settings.error)}</p>
      ) : (
        <CompanyForm saved={settings.data} onSaved={settings.setData} />
      )}
    </>
  )
}

function CompanyForm({ saved, onSaved }: { saved: CompanySettings; onSaved: (s: CompanySettings) => void }) {
  const { can } = useAuth()
  const readOnly = !can("company.edit")
  const fileInput = useRef<HTMLInputElement>(null)

  const [values, setValues] = useState<CompanySettingsRequest>(() => ({
    name: saved.name,
    logo: saved.logo,
    address: saved.address,
    phone: saved.phone,
    email: saved.email,
    receipt_footer: saved.receipt_footer,
    invoice_numbering: saved.invoice_numbering,
  }))
  const [nextNumber, setNextNumber] = useState(String(saved.next_invoice_number))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof CompanySettingsRequest>(key: K, value: CompanySettingsRequest[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  function pickLogo(file: File | undefined) {
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, logo: "Use a PNG, JPG or WebP image." }))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setErrors((e) => ({ ...e, logo: `The logo is ${Math.round(file.size / 1024)} KB; use one of at most 300 KB.` }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      set("logo", String(reader.result))
      setErrors(({ logo: _gone, ...rest }) => rest)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || readOnly) return
    setSaving(true)
    setErrors({})
    // only a changed next number is sent: orders taken while this page was open keep their numbers
    const nextChanged = values.invoice_numbering === "company" && nextNumber.trim() !== String(saved.next_invoice_number)
    if (nextChanged && !/^[1-9]\d{0,8}$/.test(nextNumber.trim())) {
      setErrors({ next_invoice_number: "Enter a whole number, 1 or more." })
      setSaving(false)
      return
    }
    try {
      const result = await saveCompanySettings(
        nextChanged ? { ...values, next_invoice_number: Number(nextNumber.trim()) } : values,
      )
      onSaved(result)
      setNextNumber(String(result.next_invoice_number))
      toast.success("Company settings saved")
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        {readOnly && (
          <Alert>
            <AlertDescription>You can see the configuration but not change it.</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            <CardDescription>Shown at the top of receipts and reports.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                  {values.logo ? (
                    <img src={values.logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={LOGO_TYPES.join(",")}
                      className="hidden"
                      onChange={(e) => {
                        pickLogo(e.target.files?.[0])
                        e.target.value = "" // the same file can be picked again
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                      <UploadIcon data-icon="inline-start" />
                      {values.logo ? "Change logo" : "Upload logo"}
                    </Button>
                    {values.logo && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => set("logo", "")}>
                        <Trash2Icon data-icon="inline-start" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <p className={errors.logo ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errors.logo ?? "PNG, JPG or WebP, at most 300 KB. A wide logo on a white background prints best."}
              </p>
            </div>

            <FormField label="Company name" required error={errors.name}>
              {(f) => (
                <Input {...f} disabled={readOnly} placeholder="e.g. Comfort Laundry" value={values.name}
                  onChange={(e) => set("name", e.target.value)} />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone" error={errors.phone}>
                {(f) => (
                  <Input {...f} disabled={readOnly} type="tel" placeholder="+971 2 555 0101" value={values.phone}
                    onChange={(e) => set("phone", e.target.value)} />
                )}
              </FormField>
              <FormField label="Email" error={errors.email}>
                {(f) => (
                  <Input {...f} disabled={readOnly} type="email" placeholder="info@example.com" value={values.email}
                    onChange={(e) => set("email", e.target.value)} />
                )}
              </FormField>
            </div>
            <FormField label="Address" error={errors.address}>
              {(f) => (
                <Textarea {...f} disabled={readOnly} rows={2} placeholder="Shop, street, area, city" value={values.address}
                  onChange={(e) => set("address", e.target.value)} />
              )}
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice numbers</CardTitle>
            <CardDescription>How new orders are numbered. Orders already taken keep their numbers.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Numbering" error={errors.invoice_numbering}
              hint={values.invoice_numbering === "company"
                ? "All branches share one sequence: 3001, 3002, …"
                : "Each branch counts on its own, with its code: KC33-00001."}>
              {(f) => (
                <SelectField id={f.id} aria-invalid={f["aria-invalid"]} disabled={readOnly}
                  value={values.invoice_numbering}
                  onValueChange={(v) => v && set("invoice_numbering", v as InvoiceNumbering)}
                  options={[
                    { value: "company", label: "One sequence for all branches" },
                    { value: "branch", label: "Per branch, with the branch code" },
                  ]} />
              )}
            </FormField>
            {values.invoice_numbering === "company" && (
              <FormField label="Next invoice number" error={errors.next_invoice_number}
                hint="A number already used is skipped.">
                {(f) => (
                  <Input {...f} disabled={readOnly} inputMode="numeric" value={nextNumber}
                    onChange={(e) => setNextNumber(e.target.value)} />
                )}
              </FormField>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receipt</CardTitle>
            <CardDescription>Printed at the bottom of every receipt.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField label="Footer / terms" error={errors.receipt_footer}
              hint="e.g. “We are not responsible for items left over 45 days.”">
              {(f) => (
                <Textarea {...f} disabled={readOnly} rows={4} value={values.receipt_footer}
                  onChange={(e) => set("receipt_footer", e.target.value)} />
              )}
            </FormField>
          </CardContent>
          {!readOnly && (
            <CardFooter className="justify-end border-t">
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                Save changes
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>

      {/* how the receipt will look */}
      <div className="grid gap-2 lg:sticky lg:top-4">
        <span className="text-sm font-medium">Receipt preview</span>
        <ReceiptHeaderPreview company={values} />
      </div>
    </div>
  )
}

function ReceiptHeaderPreview({ company }: { company: CompanySettingsRequest }) {
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-4 text-center text-xs">
      {company.logo && <img src={company.logo} alt="" className="mx-auto max-h-14 max-w-full object-contain" />}
      <div className="text-sm font-semibold">{company.name || "Company name"}</div>
      {company.address && <div className="whitespace-pre-line text-muted-foreground">{company.address}</div>}
      {(company.phone || company.email) && (
        <div className="text-muted-foreground">{[company.phone, company.email].filter(Boolean).join(" · ")}</div>
      )}
      <div className="my-1 border-t border-dashed" />
      <div className="text-muted-foreground">
        INV# {company.invoice_numbering === "company" ? "3001" : "KC33-00001"} · 2 × Shirt … AED 16.00
      </div>
      <div className="my-1 border-t border-dashed" />
      <div className="whitespace-pre-line text-muted-foreground">{company.receipt_footer || "Footer / terms"}</div>
    </div>
  )
}
