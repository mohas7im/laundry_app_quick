import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"
import { getLastBranchId } from "./active-branch"

export interface LoginCredentials {
  email: string
  password: string
}

/** A branch the user can work in, with the roles and permissions that apply there. */
export interface UserBranch {
  id: string
  name: string
  code: string
  /** Organization-wide roles plus roles given for this branch. */
  roles: { id: string; name: string }[]
  permissions: string[]
}

// Mirrors accounts.serializers.MeSerializer
export interface AuthUser {
  id: string
  email: string
  full_name: string
  phone: string
  is_owner: boolean
  /** Organization-wide roles and their permissions (apply in every branch). */
  roles: string[]
  permissions: string[]
  /** The branch in the current access token. */
  active_branch_id: string | null
  /** Every branch the user may switch to. */
  branches: UserBranch[]
  date_joined: string
  last_login: string | null
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

// ── In-memory cache ──────────────────────────────────────────────────────
let cachedUser: AuthUser | null = null
let inFlightMeRequest: Promise<AuthUser | null> | null = null

export const authService = {
  /** Logs in; Django sets the HttpOnly cookies (15m access + 7d refresh). */
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const { data } = await apiClient.post<{ data: AuthUser }>(ENDPOINTS.auth.login, {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
      branch_id: getLastBranchId(), // land in the last-used branch if still allowed
    })
    cachedUser = data.data
    return data.data
  },

  /** Re-issues the tokens scoped to another branch (new role/permission claims). */
  async switchBranch(branchId: string): Promise<AuthUser> {
    const { data } = await apiClient.post<{ data: AuthUser }>(ENDPOINTS.auth.switchBranch, {
      branch_id: branchId,
    })
    cachedUser = data.data
    return data.data
  },

  /** Blacklists the refresh token, clears the cookies and the cached user. */
  async logout(): Promise<void> {
    try {
      await apiClient.post(ENDPOINTS.auth.logout)
    } finally {
      cachedUser = null
      inFlightMeRequest = null
    }
  },

  /** Changes the password. Django logs out other devices and re-issues cookies. */
  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.changePassword, payload)
  },

  /** The logged-in user, or null. Cached; concurrent callers share one request. */
  async me(forceRefresh = false): Promise<AuthUser | null> {
    if (cachedUser && !forceRefresh) return cachedUser
    if (inFlightMeRequest && !forceRefresh) return inFlightMeRequest

    inFlightMeRequest = (async () => {
      try {
        // On app start a 401 just means "not logged in" — the route guard redirects.
        const { data } = await apiClient.get<{ data: AuthUser | null }>(ENDPOINTS.auth.me, { skipAuthRedirect: true })
        cachedUser = data.data
        return data.data
      } catch {
        cachedUser = null
        return null
      } finally {
        inFlightMeRequest = null
      }
    })()

    return inFlightMeRequest
  },
}
