import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { setLastBranchId } from "./active-branch"
import { authService, type AuthUser, type LoginCredentials, type UserBranch } from "./auth.api"

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  /** The branch in the user's access token (null if they have none). */
  activeBranch: UserBranch | null
  /** Ask the server for a token scoped to another branch. */
  selectBranch: (branchId: string) => Promise<void>
  /**
   * UI hint: true if the user has this permission in the active branch (which includes
   * organization-wide roles), or organization-wide when they have no branch yet.
   * Mirrors the token's `permissions` claim; the backend enforces it.
   */
  can: (permission: string) => boolean
  login: (credentials: LoginCredentials) => Promise<AuthUser>
  logout: () => Promise<void>
  /** Re-fetch the user, e.g. after the owner changes branches or roles. */
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")

  const applyUser = useCallback((next: AuthUser | null) => {
    if (next?.active_branch_id) setLastBranchId(next.active_branch_id)
    setUser(next)
    setStatus(next ? "authenticated" : "anonymous")
  }, [])

  useEffect(() => {
    authService.me().then(applyUser)
  }, [applyUser])

  const activeBranch = useMemo(
    () => user?.branches.find((b) => b.id === user.active_branch_id) ?? null,
    [user],
  )

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const next = await authService.login(credentials)
      queryClient.clear()
      applyUser(next)
      return next
    },
    [applyUser, queryClient],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      queryClient.clear()
      applyUser(null)
    }
  }, [applyUser, queryClient])

  const reload = useCallback(async () => {
    applyUser(await authService.me(true))
  }, [applyUser])

  const selectBranch = useCallback(
    async (branchId: string) => {
      if (branchId === user?.active_branch_id) return
      applyUser(await authService.switchBranch(branchId))
      queryClient.invalidateQueries() // branch-scoped data must refetch
    },
    [user, applyUser, queryClient],
  )

  const can = useCallback(
    (permission: string) =>
      !!user && (activeBranch ? activeBranch.permissions : user.permissions).includes(permission),
    [user, activeBranch],
  )

  const value = useMemo(
    () => ({ status, user, activeBranch, selectBranch, can, login, logout, reload }),
    [status, user, activeBranch, selectBranch, can, login, logout, reload],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
