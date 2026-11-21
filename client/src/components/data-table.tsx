import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  CircleAlertIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  InboxIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/select-field"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api/errors"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** Client-side search, sorting and pagination. Shared by every list page. */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

export type DataTableFeatures = typeof dataTableFeatures
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>

const PAGE_SIZES = [10, 20, 50, 100]

type DataTableProps<TData extends RowData> = {
  /** Must be stable (module scope or useMemo). */
  columns: DataTableColumn<TData>[]
  data: TData[]
  isLoading?: boolean
  /** The query's error: shows a message and a Retry button instead of rows. */
  error?: unknown
  onRetry?: () => void
  searchPlaceholder?: string
  /** Shown when there are no rows (and no search). */
  emptyTitle?: string
  emptyMessage?: string
  getRowId?: (row: TData) => string
  /** Buttons on the right of the toolbar, e.g. Create. */
  toolbar?: React.ReactNode
  pageSize?: number
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  isLoading,
  error,
  onRetry,
  searchPlaceholder = "Search…",
  emptyTitle = "Nothing here yet",
  emptyMessage,
  getRowId,
  toolbar,
  pageSize = 10,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => column.id !== "actions",
    initialState: { pagination: { pageIndex: 0, pageSize } },
  })

  const rows = table.getRowModel().rows
  const search = ((table.state.globalFilter as string | undefined) ?? "").trim()
  const visibleColumns = table.getAllLeafColumns().length
  const { pageIndex, pageSize: size } = table.state.pagination
  const total = table.getPrePaginatedRowModel().rows.length
  const pageCount = Math.max(table.getPageCount(), 1)
  const from = total ? pageIndex * size + 1 : 0
  const to = Math.min((pageIndex + 1) * size, total)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={(table.state.globalFilter as string) ?? ""}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label={searchPlaceholder}
          />
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon className="size-3.5" />
                          ) : (
                            <ChevronsUpDownIcon className="size-3.5 opacity-50" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns} className="h-40">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Spinner />
                    Loading…
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns} className="p-0 whitespace-normal">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CircleAlertIcon />
                      </EmptyMedia>
                      <EmptyTitle>Couldn't load this list</EmptyTitle>
                      <EmptyDescription>{getApiErrorMessage(error)}</EmptyDescription>
                    </EmptyHeader>
                    {onRetry && (
                      <EmptyContent>
                        <Button variant="outline" size="sm" onClick={onRetry}>
                          Try again
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns} className="p-0 whitespace-normal">
                  {search ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <SearchXIcon />
                        </EmptyMedia>
                        <EmptyTitle>No results</EmptyTitle>
                        <EmptyDescription>Nothing matches “{search}”. Try a different search.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <InboxIcon />
                        </EmptyMedia>
                        <EmptyTitle>{emptyTitle}</EmptyTitle>
                        {emptyMessage && <EmptyDescription>{emptyMessage}</EmptyDescription>}
                      </EmptyHeader>
                    </Empty>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span id="rows-per-page-label" className="font-medium">
            Rows per page
          </span>
          <SelectField
            aria-label="Rows per page"
            size="sm"
            className="w-20"
            value={String(size)}
            onValueChange={(v) => v && table.setPageSize(Number(v))}
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: n }))}
          />
          <span className="text-muted-foreground tabular-nums">
            {from}–{to} of {total}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium tabular-nums">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="First page"
              disabled={!table.getCanPreviousPage()} onClick={() => table.firstPage()}>
              <ChevronsLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Previous page"
              disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page"
              disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRightIcon />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Last page"
              disabled={!table.getCanNextPage()} onClick={() => table.lastPage()}>
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
