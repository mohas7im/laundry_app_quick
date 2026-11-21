import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AlertCircleIcon, LoaderIcon, WashingMachineIcon } from "lucide-react"

import { FormField } from "@/components/form-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { APP_NAME } from "@/config/navigation"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/auth-context"

/** Only allow redirects to paths inside this app (no //evil.com or https://…). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get("expired") === "1"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await login({ email, password })
      navigate(safeNext(params.get("next")), { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not log in. Please try again."))
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          <WashingMachineIcon className="size-6" />
          {APP_NAME}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Log in</CardTitle>
            <CardDescription>Use the email and password from your shop owner.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              {expired && !error && (
                <Alert>
                  <AlertCircleIcon />
                  <AlertDescription>Your session expired. Please log in again.</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <FormField label="Email">
                {(field) => (
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </FormField>

              <FormField label="Password">
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </FormField>

              <Button type="submit" className="w-full" disabled={pending || !email || !password}>
                {pending && <LoaderIcon className="animate-spin" />}
                {pending ? "Logging in…" : "Log in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
