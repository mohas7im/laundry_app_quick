import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Loads data from a service function (not cached: always from the server) and
 * keeps its loading / error state.
 *
 *   const services = useRecords(getServices, [])
 *   services.data, services.loading, services.error
 *   services.reload()  after a save or delete (rows stay on screen meanwhile)
 *   services.retry()   for "Try again" (shows the spinner again)
 *
 * `fetcher` must be stable: a module-level function, or wrapped in useCallback.
 * When it changes (e.g. another price list), the newer answer always wins.
 */
export function useRecords<T>(fetcher: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const latest = useRef(0)

  const reload = useCallback(() => {
    const request = ++latest.current
    return fetcher()
      .then((result) => {
        if (request !== latest.current) return
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (request === latest.current) setError(err)
      })
      .finally(() => {
        if (request === latest.current) setLoading(false)
      })
  }, [fetcher])

  useEffect(() => {
    reload()
  }, [reload])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    reload()
  }, [reload])

  // setData: when a save already returns the fresh data, no need to fetch again
  return { data, setData, loading, error, reload, retry }
}
