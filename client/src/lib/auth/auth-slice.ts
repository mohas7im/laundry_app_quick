// Logged-in user in Redux. Login/logout/branch switch also reset or refresh the API cache.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"

import { baseApi, TAGS } from "@/lib/api/base-api"
import { setLastBranchId } from "./active-branch"
import { authService, type AuthUser, type LoginCredentials } from "./auth.api"

export type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthState = { status: AuthStatus; user: AuthUser | null }

const initialState: AuthState = { status: "loading", user: null }

function remember(user: AuthUser | null) {
  if (user?.active_branch_id) setLastBranchId(user.active_branch_id)
  return user
}

/** App start: who is logged in (null if nobody). */
export const initAuth = createAsyncThunk("auth/init", async () => remember(await authService.me()))

/** Re-fetch the user, e.g. after roles or branches change. */
export const reloadUser = createAsyncThunk("auth/reload", async () => remember(await authService.me(true)))

export const login = createAsyncThunk("auth/login", async (credentials: LoginCredentials, { dispatch }) => {
  const user = await authService.login(credentials)
  dispatch(baseApi.util.resetApiState()) // nothing cached from a previous user
  return remember(user)
})

export const logout = createAsyncThunk("auth/logout", async (_: void, { dispatch }) => {
  try {
    await authService.logout()
  } finally {
    dispatch(baseApi.util.resetApiState())
  }
})

/** New token scoped to another branch; branch-scoped data must refetch. */
export const switchBranch = createAsyncThunk("auth/switchBranch", async (branchId: string, { dispatch }) => {
  const user = await authService.switchBranch(branchId)
  dispatch(baseApi.util.invalidateTags([...TAGS]))
  return remember(user)
})

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    const signedIn = (state: AuthState, user: AuthUser | null) => {
      state.user = user
      state.status = user ? "authenticated" : "anonymous"
    }
    builder
      .addCase(initAuth.fulfilled, (state, { payload }) => signedIn(state, payload))
      .addCase(initAuth.rejected, (state) => signedIn(state, null))
      .addCase(reloadUser.fulfilled, (state, { payload }) => signedIn(state, payload))
      .addCase(login.fulfilled, (state, { payload }) => signedIn(state, payload))
      .addCase(switchBranch.fulfilled, (state, { payload }) => signedIn(state, payload))
      .addCase(logout.fulfilled, (state) => signedIn(state, null))
      .addCase(logout.rejected, (state) => signedIn(state, null))
  },
})

export const authReducer = authSlice.reducer
