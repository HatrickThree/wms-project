"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpDown,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Filter,
  Layers3,
  List,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  EmptyState,
  Feedback,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "./common";
import {
  currentLocation,
  type InventoryResult,
  type SerialRecord,
  request,
  serialStatuses,
} from "@/lib/wms";
import { formatDate, formatNumber } from "@/lib/utils";
import { ScanInput } from "./scan-input";

const emptyFilters = {
  keyword: "",
  status: "ALL",
  category: "ALL",
  zone: "ALL",
  locationBarcode: "",
  docNo: "",
  lotNumber: "",
  dateFrom: "",
  dateTo: "",
};
type Filters = typeof emptyFilters;
type Group = InventoryResult["groupedSummary"][number];
const filterNames: Record<keyof Filters, string> = {
  keyword: "คำค้น",
  status: "สถานะ",
  category: "หมวดหมู่",
  zone: "โซน",
  locationBarcode: "ชั้นวาง",
  docNo: "เอกสาร",
  lotNumber: "Lot",
  dateFrom: "ตั้งแต่",
  dateTo: "ถึง",
};
const columnNames: Record<string, string> = {
  serialNumber: "Serial Number",
  product: "สินค้า",
  status: "สถานะ",
  location: "ตำแหน่ง",
  lotNumber: "Lot",
  inboundDocNo: "เอกสารรับเข้า",
  receivedAt: "วันที่รับเข้า",
};
function parseFilters(query: string): Filters {
  const params = new URLSearchParams(query);
  return Object.fromEntries(
    Object.entries(emptyFilters).map(([key, fallback]) => [
      key,
      params.get(key) || fallback,
    ]),
  ) as Filters;
}
function serializeFilters(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value.trim() && value !== "ALL") params.set(key, value.trim());
  return params.toString();
}

function InventoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [filters, setFilters] = useState<Filters>(() => parseFilters(query));
  const [data, setData] = useState<InventoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<SerialRecord | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>({
    lotNumber: false,
    inboundDocNo: false,
  });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => {
    setFilters(parseFilters(query));
    setValidation(null);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelected(null);
    setGroup(null);
    request<InventoryResult>(`/api/inventory?${query}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setUpdatedAt(new Date());
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, refresh]);
  const apply = (next: Filters) => {
    if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
      setValidation("วันที่สิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น");
      return;
    }
    setValidation(null);
    setFilterOpen(false);
    const nextQuery = serializeFilters(next);
    if (nextQuery === query) setRefresh((value) => value + 1);
    else
      router.push(`/inventory${nextQuery ? `?${nextQuery}` : ""}`, {
        scroll: false,
      });
  };
  const change = (name: keyof Filters, value: string) =>
    setFilters((previous) => ({ ...previous, [name]: value }));
  const columns = useMemo<ColumnDef<SerialRecord>[]>(
    () => [
      {
        accessorKey: "serialNumber",
        header: "Serial Number",
        cell: ({ row }) => (
          <button
            className="mono min-h-11 text-left text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSelected(row.original)}
          >
            {row.original.serialNumber}
          </button>
        ),
        enableHiding: false,
      },
      {
        id: "product",
        accessorFn: (row) => row.product.sku,
        header: "สินค้า",
        cell: ({ row }) => (
          <div className="min-w-[150px] max-w-[250px]">
            <p className="mono text-xs font-medium">
              {row.original.product.sku}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {row.original.product.name}
            </p>
          </div>
        ),
        enableHiding: false,
      },
      {
        accessorKey: "status",
        header: "สถานะ",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "location",
        accessorFn: (row) => currentLocation(row),
        header: "ตำแหน่ง",
        cell: ({ row }) => (
          <div>
            <p className="mono whitespace-nowrap text-xs">
              {currentLocation(row.original)}
            </p>
            {row.original.location && (
              <p className="mt-1 text-xs text-muted-foreground">
                โซน {row.original.location.zone}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "lotNumber",
        header: "Lot",
        cell: ({ getValue }) => (
          <span className="mono text-xs">{getValue<string>() || "—"}</span>
        ),
      },
      {
        accessorKey: "inboundDocNo",
        header: "เอกสารรับเข้า",
        cell: ({ getValue }) => (
          <span className="mono text-xs">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "receivedAt",
        header: "วันที่รับเข้า",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDate(getValue<string>())}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`ดูรายละเอียด ${row.original.serialNumber}`}
            onClick={() => setSelected(row.original)}
          >
            <ArrowRight />
          </Button>
        ),
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [],
  );
  const records = useMemo(() => data?.serialItems || [], [data]);
  const table = useReactTable({
    data: records,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  const activeFilters = Object.entries(parseFilters(query)).filter(
    ([, value]) => value && value !== "ALL",
  ) as [keyof Filters, string][];
  const options = data?.filterOptions;
  const filterFields = (
    <div className="space-y-5">
      {(
        [
          {
            key: "category",
            label: "หมวดหมู่",
            options: options?.categories || [],
          },
          { key: "zone", label: "โซน", options: options?.zones || [] },
        ] as const
      ).map((field) => (
        <div key={field.key} className="field-group">
          <Label htmlFor={`filter-${field.key}`}>{field.label}</Label>
          <Select
            value={filters[field.key]}
            onValueChange={(value) => change(field.key, value)}
          >
            <SelectTrigger id={`filter-${field.key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ทั้งหมด</SelectItem>
              {field.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {(
        [
          {
            key: "locationBarcode",
            label: "ชั้นวาง",
            placeholder: "เช่น A-01-01-01",
          },
          {
            key: "docNo",
            label: "เลขที่เอกสาร",
            placeholder: "เลขที่ใบรับ / ใบจ่าย",
          },
          {
            key: "lotNumber",
            label: "Lot Number",
            placeholder: "เช่น LOT-2026-10A",
          },
        ] as const
      ).map((field) => (
        <div key={field.key} className="field-group">
          <Label htmlFor={`filter-${field.key}`}>{field.label}</Label>
          <Input
            id={`filter-${field.key}`}
            value={filters[field.key]}
            onChange={(event) => change(field.key, event.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <div className="field-group">
          <Label htmlFor="filter-dateFrom">รับเข้าตั้งแต่วันที่</Label>
          <Input
            id="filter-dateFrom"
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(event) => change("dateFrom", event.target.value)}
            onInput={(event) => change("dateFrom", event.currentTarget.value)}
          />
        </div>
        <div className="field-group">
          <Label htmlFor="filter-dateTo">ถึงวันที่</Label>
          <Input
            id="filter-dateTo"
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(event) => change("dateTo", event.target.value)}
            onInput={(event) => change("dateTo", event.currentTarget.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        วันที่รับเข้าอ้างอิงเวลาไทย
      </p>
    </div>
  );
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="WORKSPACE / INVENTORY"
        title="สินค้าคงคลัง"
        description="ค้นหาสินค้าและตำแหน่งจัดเก็บ แม้ยังไม่ทราบ Serial Number"
        action={
          <Button asChild>
            <Link href="/inbound">
              <ArrowDownToLine />
              รับสินค้าเข้า
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Serial ที่พบ", count: records.length, icon: Boxes },
          {
            label: "อยู่ในคลังที่พบ",
            count: records.filter((record) => record.status === "IN_STOCK")
              .length,
            icon: CheckCircle2,
          },
          {
            label: "SKU ที่พบ",
            count: new Set(records.map((record) => record.product.sku)).size,
            icon: Package,
          },
          {
            label: "ชั้นวางที่พบ",
            count: new Set(
              records.flatMap((record) =>
                record.location ? [record.location.barcode] : [],
              ),
            ).size,
            icon: MapPin,
          },
        ].map(({ label, count, icon: Icon }) => (
          <Card key={label} className="shadow-none">
            <CardContent className="flex items-center gap-3 !p-4 sm:!p-5">
              <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 sm:flex">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {loading || error ? "—" : formatNumber(count)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4 !p-4 sm:!p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply(filters);
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="inventory-keyword">
                ค้นหา SKU ชื่อสินค้า Serial Lot หรือเอกสาร
              </label>
              <Search className="pointer-events-none absolute left-3 top-4 size-4 text-muted-foreground" />
              <ScanInput
                scannerTitle="สแกนรหัสเพื่อค้นหาสต็อก"
                onScanValue={(value) => change("keyword", value)}
                id="inventory-keyword"
                value={filters.keyword}
                onChange={(event) => change("keyword", event.target.value)}
                placeholder="ค้นหา SKU, ชื่อสินค้า, Serial หรือเอกสาร..."
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={filters.status}
                onValueChange={(value) => change("status", value)}
              >
                <SelectTrigger
                  aria-label="สถานะ Serial"
                  className="w-full sm:w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">ทุกสถานะ</SelectItem>
                  {Object.entries(serialStatuses).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" className="h-12">
                <Search />
                ค้นหา
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12"
                aria-label="เปิดตัวกรองเพิ่มเติม"
                onClick={() => setFilterOpen(true)}
              >
                <Filter />
                <span className="hidden md:inline">ตัวกรอง</span>
                {activeFilters.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[10px] text-primary">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            </div>
          </form>
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="gap-1 pr-0.5">
                  {filterNames[key]}:{" "}
                  {key === "status"
                    ? serialStatuses[value as keyof typeof serialStatuses] ||
                      value
                    : value}
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded hover:bg-slate-200"
                    aria-label={`ลบตัวกรอง ${filterNames[key]}`}
                    onClick={() =>
                      apply({
                        ...parseFilters(query),
                        [key]: emptyFilters[key],
                      })
                    }
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters(emptyFilters);
                  apply(emptyFilters);
                }}
              >
                <RotateCcw />
                ล้างทั้งหมด
              </Button>
            </div>
          )}
          {validation && (
            <Feedback value={{ kind: "error", text: validation }} />
          )}
        </CardContent>
      </Card>
      <Tabs defaultValue="summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="summary">
              <Layers3 className="size-4" />
              ตามสินค้า / ชั้นวาง
            </TabsTrigger>
            <TabsTrigger value="serials">
              <List className="size-4" />
              รายการ Serial
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            รีเฟรช
          </Button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          ยอดจากรายการที่โหลดตามตัวกรองปัจจุบัน สูงสุด 300 S/N ·
          ทุกคลังในพื้นที่ปัจจุบัน
          {updatedAt && !loading && ` · อัปเดต ${formatDate(updatedAt, true)}`}
        </p>
        {error ? (
          <div className="mt-4">
            <Feedback value={{ kind: "error", text: error }} />
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => setRefresh((value) => value + 1)}
            >
              ลองโหลดอีกครั้ง
            </Button>
          </div>
        ) : loading ? (
          <Card className="mt-5">
            <LoadingState />
          </Card>
        ) : (
          <>
            {records.length >= 300 && (
              <div className="mt-4">
                <Feedback
                  value={{
                    kind: "uncertain",
                    text: "แสดงสูงสุด 300 รายการ ยอดบนหน้านี้อาจไม่ใช่ยอดทั้งหมด กรุณาเพิ่มตัวกรองให้แคบลง",
                  }}
                />
              </div>
            )}
            <TabsContent value="summary">
              <Card>
                {data?.groupedSummary.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>สินค้า</TableHead>
                        <TableHead>ตำแหน่งจัดเก็บ</TableHead>
                        <TableHead className="text-right">S/N ที่พบ</TableHead>
                        <TableHead className="text-right">
                          อยู่ในคลังที่พบ
                        </TableHead>
                        <TableHead>
                          <span className="sr-only">ดูรายการ</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.groupedSummary.map((item) => (
                        <TableRow key={`${item.sku}-${item.locationBarcode}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg border bg-slate-50 sm:flex">
                                <Package className="size-5 text-slate-500" />
                              </span>
                              <div className="max-w-[230px]">
                                <p className="mono text-xs font-semibold">
                                  {item.sku}
                                </p>
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  {item.productName}
                                </p>
                                <Badge
                                  variant="secondary"
                                  className="mt-1.5 py-0.5 text-[10px]"
                                >
                                  {item.category}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="mono max-w-52 text-xs">
                              {item.locationBarcode.startsWith(
                                "OUT-OF-WAREHOUSE",
                              )
                                ? "ไม่ระบุตำแหน่งปัจจุบัน"
                                : item.locationBarcode}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              โซน {item.zone}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.totalMatchedCount}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                            {item.inStockCount}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setGroup(item)}
                            >
                              ดู S/N
                              <ArrowRight />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="ไม่พบสินค้าตามตัวกรองนี้"
                    description="ลองค้นหาด้วยชื่อสินค้า SKU หรือปรับลดตัวกรอง"
                    action={
                      <Button
                        variant="outline"
                        onClick={() => {
                          setFilters(emptyFilters);
                          apply(emptyFilters);
                        }}
                      >
                        ล้างตัวกรอง
                      </Button>
                    }
                  />
                )}
              </Card>
            </TabsContent>
            <TabsContent value="serials">
              <Card>
                <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
                  <p className="text-sm font-medium">
                    รายการ Serial{" "}
                    <span className="ml-1 text-muted-foreground">
                      ({records.length})
                    </span>
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Columns3 />
                        คอลัมน์
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {table
                        .getAllColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) =>
                              column.toggleVisibility(!!value)
                            }
                          >
                            {columnNames[column.id] || column.id}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {records.length ? (
                  <>
                    <Table>
                      <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <TableHead
                                key={header.id}
                                aria-sort={
                                  header.column.getIsSorted() === "asc"
                                    ? "ascending"
                                    : header.column.getIsSorted() === "desc"
                                      ? "descending"
                                      : undefined
                                }
                              >
                                {header.column.getCanSort() ? (
                                  <button
                                    onClick={header.column.getToggleSortingHandler()}
                                    className="flex min-h-11 items-center gap-2 whitespace-nowrap"
                                  >
                                    {flexRender(
                                      header.column.columnDef.header,
                                      header.getContext(),
                                    )}
                                    <ArrowUpDown className="size-3" />
                                  </button>
                                ) : (
                                  flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )
                                )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground">
                      <p>
                        หน้า {table.getState().pagination.pageIndex + 1} /{" "}
                        {table.getPageCount()} · เรียงเฉพาะ {records.length}{" "}
                        รายการที่โหลด
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!table.getCanPreviousPage()}
                          onClick={() => table.previousPage()}
                        >
                          <ChevronLeft />
                          ก่อนหน้า
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!table.getCanNextPage()}
                          onClick={() => table.nextPage()}
                        >
                          ถัดไป
                          <ChevronRight />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="ไม่พบ Serial ที่ตรงกัน"
                    description="ลองลดตัวกรองหรือค้นด้วย SKU และชื่อสินค้า"
                  />
                )}
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
      <Sheet
        open={filterOpen}
        onOpenChange={(open) => {
          setFilterOpen(open);
          if (!open) {
            setFilters(parseFilters(query));
            setValidation(null);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>ตัวกรองเพิ่มเติม</SheetTitle>
            <SheetDescription>
              จำกัดผลค้นหาตามข้อมูลคลังและเอกสาร
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply(filters);
            }}
            className="flex flex-1 flex-col gap-6"
          >
            {filterFields}
            {validation && (
              <Feedback value={{ kind: "error", text: validation }} />
            )}
            <div className="mt-auto flex gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilters(emptyFilters)}
              >
                ล้างตัวกรอง
              </Button>
              <Button type="submit" className="flex-1">
                <Filter />
                ใช้ตัวกรอง
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>รายละเอียด Serial</SheetTitle>
            <SheetDescription>ข้อมูลปัจจุบันจากผลค้นหา</SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <div className="flex size-14 items-center justify-center rounded-xl bg-blue-50 text-primary">
                <Package className="size-7" />
              </div>
              <div>
                <p className="mono break-all text-xl font-semibold">
                  {selected.serialNumber}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selected.product.name}
                </p>
                <div className="mt-3">
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <dl className="divide-y rounded-xl border px-4">
                {[
                  ["SKU", selected.product.sku],
                  ["ตำแหน่ง", currentLocation(selected)],
                  ["Lot", selected.lotNumber || "—"],
                  ["เอกสารรับเข้า", selected.inboundDocNo],
                  ["เอกสารจ่ายออก", selected.outboundDocNo || "—"],
                  ["วันที่รับเข้า", formatDate(selected.receivedAt, true)],
                ].map(([label, value]) => (
                  <div key={label} className="space-y-1 py-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <Button asChild className="mt-auto">
                <Link
                  href={`/serials?sn=${encodeURIComponent(selected.serialNumber)}`}
                >
                  เปิดประวัติการเคลื่อนไหว
                  <ArrowRight />
                </Link>
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!group}
        onOpenChange={(open) => {
          if (!open) setGroup(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Serial ตามตำแหน่ง</SheetTitle>
            <SheetDescription>
              {group?.sku} ·{" "}
              {group?.locationBarcode.startsWith("OUT-OF-WAREHOUSE")
                ? "ไม่ระบุตำแหน่งปัจจุบัน"
                : group?.locationBarcode}
            </SheetDescription>
          </SheetHeader>
          <p className="text-xs text-muted-foreground">
            {group?.totalMatchedCount} รายการจากผลที่โหลด
          </p>
          <div className="space-y-3">
            {group?.serialNumbers.map((serial) => (
              <div key={serial.serialNumber} className="rounded-lg border p-4">
                <Link
                  href={`/serials?sn=${encodeURIComponent(serial.serialNumber)}`}
                  className="mono inline-flex min-h-11 items-center gap-2 break-all text-sm font-medium text-primary"
                >
                  {serial.serialNumber}
                  <ArrowRight className="size-3 shrink-0" />
                </Link>
                <div className="mt-1">
                  <StatusBadge status={serial.status} />
                </div>
                <p className="mt-3 break-all text-xs text-muted-foreground">
                  {serial.inboundDocNo} · Lot {serial.lotNumber || "—"}
                </p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
export function InventoryScreen() {
  return (
    <Suspense fallback={<LoadingState />}>
      <InventoryContent />
    </Suspense>
  );
}
