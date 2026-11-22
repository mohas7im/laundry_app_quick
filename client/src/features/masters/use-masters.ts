import { useCallback, useMemo } from "react"

import { useRecords } from "@/lib/use-records"
import { getMasters } from "./services/masters.service"
import type { CommonMaster, MasterTypeCode } from "./types"

/**
 * A common master list for a form dropdown (active values, in order):
 *
 *   const categories = useMasters(MASTER.ITEM_CATEGORY)
 *   <SelectField options={categories.options} … />
 *
 * `keep`: a code to keep in the options even if it was hidden since (the value a
 * record already has), so editing an old record still shows it.
 */
export function useMasters(type: MasterTypeCode, keep?: string) {
  const fetcher = useCallback(() => getMasters(type), [type])
  const { data, loading, error } = useRecords(fetcher, [] as CommonMaster[])

  const options = useMemo(
    () =>
      data
        .filter((m) => m.is_active || m.code === keep)
        .map((m) => ({ value: m.code, label: m.is_active ? m.name : `${m.name} (hidden)` })),
    [data, keep],
  )
  const nameOf = useCallback((code: string) => data.find((m) => m.code === code)?.name ?? code, [data])

  return { values: data, options, nameOf, loading, error }
}
