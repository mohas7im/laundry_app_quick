import { APP_NAME } from "@/config/navigation"
import { LoginForm } from "../components/login-form"

export function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="grid w-full max-w-sm gap-6 rounded-xl border bg-card p-8 shadow-sm">
        <img src="/comfort-logo.png" alt={APP_NAME} className="mx-auto h-16 w-auto" />
        <LoginForm />
      </div>
    </div>
  )
}
