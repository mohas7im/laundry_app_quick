import { useCallback, useMemo } from "react"

import { useAppDispatch, useAppSelector } from "@/app/store"
import type { AuthUser, LoginCredentials, UserBranch } from "./auth.api"
import { login as loginThunk, logout as logoutThunk, reloadUser, switchBranch } from "./auth-slice"

/**
 * The logged-in user (from the Redux `auth` slice) and actions on it.
 *  - activeBranch: the branch in the user's access token (null if none)
 *  - can(p): true if the user has permission `p` in the active branch (which includes
 *    organization-wide roles), or organization-wide when they have no branch yet.
 *    A UI hint only; the backend enforces every permission.
 */
export function useAuth() {
  const dispatch = useAppDispatch()
  const { status, user } = useAppSelector((s) => s.auth)

  const activeBranch: UserBranch | null = useMemo(
    () => user?.branches.find((b) => b.id === user.active_branch_id) ?? null,
    [user],
  )

  const can = useCallback(
    (permission: string) =>
      !!user && (activeBranch ? activeBranch.permissions : user.permissions).includes(permission),
    [user, activeBranch],
  )

  const login = useCallback(
    (credentials: LoginCredentials): Promise<AuthUser | null> => dispatch(loginThunk(credentials)).unwrap(),
    [dispatch],
  )
  const logout = useCallback(async () => {
    await dispatch(logoutThunk())
  }, [dispatch])
  const reload = useCallback(async () => {
    await dispatch(reloadUser())
  }, [dispatch])
  const selectBranch = useCallback(
    async (branchId: string) => {
      if (branchId === user?.active_branch_id) return
      await dispatch(switchBranch(branchId)).unwrap()
    },
    [dispatch, user?.active_branch_id],
  )

  return { status, user, activeBranch, can, login, logout, reload, selectBranch }
}
