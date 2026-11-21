// Every API path in one place. Callers use these instead of typing URLs.
// Django URLs end with a trailing slash — keep it, or Django will 404/redirect.
//
//   auth → /api/auth/*   session management (JWT in HttpOnly cookies)

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
    changePassword: "/api/auth/change-password/",
  },
} as const
