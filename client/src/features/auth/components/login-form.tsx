// shadcn "login-02" block form, wired to our auth. Components are used with their
// default Nova styles — no size/colour overrides.
import { useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AlertCircleIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { cn } from "cn"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/use-auth"

/** Only allow redirects to paths inside this app (no //evil.com or https://…). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
}

export function LoginForm({ className, ...props }: React.ComponentProps<"form">) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get("expired") === "1"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Set synchronously, so a double-click or repeated Enter can't start a second
  // login before React re-renders with pending=true.
  const inFlight = useRef(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return

    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }

    inFlight.current = true
    setError(null)
    setPending(true)
    try {
      await login({ email, password })
      // Keep the spinner until the page changes.
      navigate(safeNext(params.get("next")), { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't log in. Check your connection and try again."))
      setPending(false)
    } finally {
      inFlight.current = false
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending}
      {...props}
    >
      {/* disabled while logging in: no edits or second submit mid-request */}
      <FieldSet disabled={pending}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-3xl font-bold">Log in to your account</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Use the email and password your shop owner gave you.
            </p>
          </div>

          {expired && !error && (
            <Alert>
              <AlertCircleIcon />
              <AlertDescription>Your session expired. Log in again to continue.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              size="lg"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              required
              placeholder="you@yourshop.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <InputGroup size="lg">
              <InputGroupInput
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>

          <Field>
            <Button type="submit" size="xl">
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? "Logging in…" : "Log in"}
            </Button>
            <FieldDescription className="text-center">
              Forgot your password? Ask your shop owner to reset it.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
