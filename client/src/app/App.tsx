import { useEffect } from "react"
import { Provider } from "react-redux"
import { RouterProvider } from "react-router"

import { router } from "@/app/router"
import { store, useAppDispatch } from "@/app/store"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { initAuth } from "@/lib/auth/auth-slice"

/** Loads the logged-in user once at startup; route guards wait for it. */
function AuthInit() {
  const dispatch = useAppDispatch()
  useEffect(() => {
    dispatch(initAuth())
  }, [dispatch])
  return null
}

export function App() {
  return (
    <Provider store={store}>
      <AuthInit />
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </Provider>
  )
}
