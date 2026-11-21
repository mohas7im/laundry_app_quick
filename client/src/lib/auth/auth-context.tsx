import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { getActiveBranchId, setActiveBranchId } from "./active-branch"
import { authService, type AuthUser, type LoginCredentials, type UserBranch } from "./auth.api"

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  /** The branch the user is working in (null if they have none). */
  activeBranch: UserBranch | null
  selectBranch: (branchId: number) => void
  /** True if the user has this permission in the active branch. Owners always do. */
  can: (permission: string) => boolean
  login: (credentials: LoginCredentials) => Promise<AuthUser>
  logout: () => Promise<void>
  /** Re-fetch the user, e.g. after the owner changes branches or roles. */
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function pickBranch(user: AuthUser | null): UserBranch | null {
  if (!user?.branches.length) return null
  const saved = getActiveBranchId()
  return user.branches.find((b) => b.id === saved) ?? user.branches[0]!
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [activeBranch, setActiveBranch] = useState<UserBranch | null>(null)

  const applyUser = useCallback((next: AuthUser | null) => {
    const branch = pickBranch(next)
    setActiveBranchId(branch?.id ?? null)
    setUser(next)
    setActiveBranch(branch)
    setStatus(next ? "authenticated" : "anonymous")
  }, [])

  useEffect(() => {
    authService.me().then(applyUser)
  }, [applyUser])

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
    (branchId: number) => {
      const branch = user?.branches.find((b) => b.id === branchId)
      if (!branch) return
      setActiveBranchId(branch.id)
      setActiveBranch(branch)
      queryClient.invalidateQueries() // branch-scoped data must refetch
    },
    [user, queryClient],
  )

  const can = useCallback(
    (permission: string) => !!user && (user.is_owner || !!activeBranch?.permissions.includes(permission)),
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
