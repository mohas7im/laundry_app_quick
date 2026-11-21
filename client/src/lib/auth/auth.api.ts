import { apiClient } from "@/lib/api/client"
import { ENDPOINTS } from "@/lib/api/endpoints"

export interface LoginCredentials {
  email: string
  password: string
}

/** A branch the user can work in, with their role and permission codes there. */
export interface UserBranch {
  id: number
  name: string
  code: string
  role: { id: number; name: string } | null // null for the owner
  permissions: string[]
}

// Mirrors accounts.serializers.MeSerializer
export interface AuthUser {
  id: number
  email: string
  full_name: string
  phone: string
  is_owner: boolean
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
    const { data } = await apiClient.post<{ user: AuthUser }>(ENDPOINTS.auth.login, {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    })
    cachedUser = data.user
    return data.user
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
        const { data } = await apiClient.get<AuthUser>(ENDPOINTS.auth.me, { skipAuthRedirect: true })
        cachedUser = data
        return data
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
