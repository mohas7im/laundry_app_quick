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
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  SearchIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/select-field"
import { Skeleton } from "@/components/ui/skeleton"
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
  searchPlaceholder?: string
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
  searchPlaceholder = "Search…",
  emptyMessage = "Nothing here yet.",
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
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={visibleColumns}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
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
              <TableRow>
                <TableCell colSpan={visibleColumns} className="h-24 text-center text-muted-foreground">
                  {table.state.globalFilter ? "No matches." : emptyMessage}
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
