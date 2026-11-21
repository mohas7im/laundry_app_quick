// Every API path in one place. Callers use these instead of typing URLs.
// Django URLs end with a trailing slash — keep it, or Django will 404/redirect.
//
//   auth   → /api/auth/*   session management (JWT in HttpOnly cookies)
//   admin  → branches, roles, permissions, users, menus
//   branch → customers (counter work, permissions of the active branch)

type Id = string | number

// Use for each new resource, e.g. `customers: crud("/api/customers")`.
export const crud = (base: string) => ({
  list: `${base}/`,
  byId: (id: Id) => `${base}/${id}/`,
})

export const ENDPOINTS = {
  auth: {
    csrf: "/api/auth/csrf/",
    login: "/api/auth/login/",
    logout: "/api/auth/logout/",
    refresh: "/api/auth/refresh/",
    me: "/api/auth/me/",
    switchBranch: "/api/auth/switch-branch/",
    changePassword: "/api/auth/change-password/",
  },

  branches: crud("/api/branches"),
  roles: crud("/api/roles"),
  permissions: {
    matrix: "/api/permissions/",
    role: (roleId: Id) => `/api/permissions/roles/${roleId}/`,
  },
  menus: { ...crud("/api/menus"), my: "/api/menus/my/" },
  users: crud("/api/users"),
  customers: crud("/api/customers"),
} as const
