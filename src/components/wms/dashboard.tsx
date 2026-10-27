import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ArrowUpFromLine,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Clock3,
  History,
  Package,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/utils";
import { movementLabels } from "@/lib/wms";
import { PageHeader, EmptyState } from "@/components/wms/common";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

async function loadDashboard() {
  const [products, available, movements, locations] = await Promise.all([
    prisma.product.findMany({
      include: { inventories: { include: { location: true } } },
      orderBy: { sku: "asc" },
    }),
    prisma.serialItem.groupBy({
      by: ["productId"],
      where: {
        status: "IN_STOCK",
        location: { type: { in: ["STORAGE", "PICKING"] } },
      },
      _count: { _all: true },
    }),
    prisma.stockLedger.findMany({
      take: 7,
      orderBy: { createdAt: "desc" },
      include: { product: true, serialItem: true },
    }),
    prisma.location.count(),
  ]);
  const readyMap = new Map(
    available.map((item) => [item.productId, item._count._all]),
  );
  const units = new Map<string, number>();
  const stock = products.map((product) => {
    const onHand = product.inventories.reduce(
      (sum, balance) => sum + balance.qtyOnHand,
      0,
    );
    units.set(product.baseUom, (units.get(product.baseUom) || 0) + onHand);
    const ready = product.trackSerial
      ? readyMap.get(product.id) || 0
      : product.inventories
          .filter((balance) =>
            ["STORAGE", "PICKING"].includes(balance.location.type),
          )
          .reduce(
            (sum, balance) =>
              sum + Math.max(0, balance.qtyOnHand - balance.qtyAllocated),
            0,
          );
    return {
      sku: product.sku,
      name: product.name,
      ready,
      minStock: product.minStock,
      unit: product.baseUom,
    };
  });
  return {
    products: products.length,
    units: [...units],
    readySerials: available.reduce((sum, item) => sum + item._count._all, 0),
    low: stock.filter((product) => product.ready < product.minStock),
    movements,
    locations,
    updatedAt: new Date(),
  };
}

export async function Dashboard() {
  const data = await loadDashboard().catch(() => null);
  const cards = [
    {
      label: "สินค้าในคลัง",
      value: data
        ? data.units.length === 1
          ? formatNumber(data.units[0][1])
          : data.units.length
            ? "หลายหน่วย"
            : "0"
        : "—",
      detail: data
        ? data.units.length === 1
          ? `หน่วย ${data.units[0][0]} · ยอดจริงทุกตำแหน่ง`
          : data.units
              .map(([unit, count]) => `${formatNumber(count)} ${unit}`)
              .join(" · ") || "ยังไม่มียอดสินค้า"
        : "ยังไม่มีข้อมูลสรุป",
      icon: Boxes,
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: "Serial พร้อมจ่าย",
      value: data ? formatNumber(data.readySerials) : "—",
      detail: "สถานะอยู่ในคลัง ในพื้นที่จัดเก็บและหยิบ",
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "สินค้าในระบบ",
      value: data ? formatNumber(data.products) : "—",
      detail: data
        ? `SKU · ${formatNumber(data.locations)} ตำแหน่งจัดเก็บ`
        : "ยังไม่มีข้อมูลสรุป",
      icon: Package,
      color: "bg-violet-50 text-violet-700",
    },
    {
      label: "ต่ำกว่าจุดเตือน",
      value: data ? formatNumber(data.low.length) : "—",
      detail: "SKU ที่ยอดพร้อมจ่ายต่ำกว่าขั้นต่ำ",
      icon: TriangleAlert,
      color: "bg-amber-50 text-amber-700",
    },
  ];
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="WORKSPACE / OVERVIEW"
        title="ภาพรวมคลังสินค้า"
        description="ทุกความเคลื่อนไหว มองเห็นได้ในที่เดียว"
        action={
          <Button asChild>
            <Link href="/inbound">
              <ArrowDownToLine />
              รับสินค้าเข้า
            </Link>
          </Button>
        }
      />
      <section className="relative overflow-hidden rounded-2xl bg-[#142846] px-6 py-7 text-white sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 size-64 rounded-full border-[36px] border-white/[0.035]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-28 top-14 size-40 rotate-12 rounded-3xl border border-blue-300/10 bg-blue-300/[0.025]"
        />
        <div className="relative flex items-center justify-between gap-5">
          <div>
            <Badge
              className="mb-4 border-blue-400/25 bg-blue-400/10 text-blue-100"
              variant="outline"
            >
              <span className="size-1.5 rounded-full bg-blue-300" />
              พื้นที่ทำงานของคลังคุณ
            </Badge>
            <h2 className="text-xl font-semibold leading-relaxed sm:text-2xl">
              จัดการทุกชิ้น ให้เป็นระบบ
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">
              รับเข้า จัดเก็บ และจ่ายสินค้า พร้อมติดตามประวัติ Serial
              ย้อนหลังได้เสมอ
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Boxes className="size-3.5" />
                ขอบเขต: ทุกคลังสินค้า
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="size-3.5" />
                {data
                  ? `อัปเดต ${formatDate(data.updatedAt, true)}`
                  : "กำลังรอข้อมูลคลัง"}
              </span>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="hidden size-24 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white/5 sm:flex"
          >
            <Boxes className="size-12 stroke-[1.2] text-blue-200" />
          </div>
        </div>
      </section>
      {!data && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            ยังโหลดข้อมูลภาพรวมไม่ได้ กรุณารีเฟรชหน้า หรือลองค้นหาสต็อกอีกครั้ง
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, color }) => (
          <Card key={label} className="shadow-none">
            <CardContent className="!p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <span
                  className={`flex size-10 items-center justify-center rounded-xl ${color}`}
                >
                  <Icon className="size-5" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
                {value}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>การเคลื่อนไหวล่าสุด</CardTitle>
              <CardDescription className="mt-1">
                รายการที่บันทึกแล้วจากทุกคลัง
              </CardDescription>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <History className="size-4 text-muted-foreground" />
            </span>
          </CardHeader>
          <CardContent className="!px-0 !pb-0">
            {data?.movements.length ? (
              <div className="divide-y">
                {data.movements.map((movement) => {
                  const incoming = [
                    "INBOUND_RECEIVE",
                    "RETURN_IN",
                    "ADJUSTMENT_PLUS",
                  ].includes(movement.movementType);
                  const transfer = ["INTERNAL_TRANSFER", "PUTAWAY"].includes(
                    movement.movementType,
                  );
                  const Icon = transfer
                    ? ArrowLeftRight
                    : incoming
                      ? ArrowDownLeft
                      : ArrowUpRight;
                  return (
                    <div
                      key={movement.id}
                      className="flex items-center gap-3 px-5 py-4 sm:px-6"
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${transfer ? "bg-blue-50 text-blue-700" : incoming ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {movementLabels[movement.movementType] ||
                            movement.movementType}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {movement.product.sku}
                          </span>
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {movement.referenceDoc} ·{" "}
                          {movement.serialItem?.serialNumber ||
                            movement.product.name}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {transfer ? "ย้าย " : incoming ? "+" : "−"}
                          {Math.abs(movement.qtyChange)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {movement.product.baseUom}
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDate(movement.createdAt, true)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="ยังไม่มีรายการเคลื่อนไหว"
                description="เมื่อบันทึกรับเข้าหรือจ่ายออกแล้ว รายการจะแสดงที่นี่"
              />
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>เริ่มงานได้ทันที</CardTitle>
              <CardDescription>เลือกงานที่คุณต้องการทำ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                {
                  href: "/inbound",
                  label: "รับสินค้าเข้า",
                  hint: "สแกนสะสม Serial และบันทึก",
                  icon: ArrowDownToLine,
                  color: "bg-blue-50 text-blue-700",
                },
                {
                  href: "/outbound",
                  label: "จ่ายสินค้าออก",
                  hint: "ตรวจสอบก่อนตัดจ่ายรายชิ้น",
                  icon: ArrowUpFromLine,
                  color: "bg-orange-50 text-orange-700",
                },
                {
                  href: "/serials",
                  label: "ติดตามประวัติ Serial",
                  hint: "ย้อนดูทุกการเคลื่อนไหว",
                  icon: ScanLine,
                  color: "bg-violet-50 text-violet-700",
                },
              ].map(({ href, label, hint, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${color}`}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <ArrowRight className="size-4 text-slate-400" />
                </Link>
              ))}
            </CardContent>
          </Card>
          <div className="rounded-xl border border-dashed bg-slate-50 p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ScanLine className="size-4 text-primary" />
              ค้นหาได้ แม้ไม่รู้ Serial
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              ใช้ชื่อสินค้า SKU Lot หรือเลขเอกสาร
              เพื่อค้นหาตำแหน่งและหมายเลขเครื่อง
            </p>
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs">
              <Link href="/inventory">
                ไปที่สินค้าคงคลัง
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-600" />
              สินค้าต่ำกว่าจุดเตือน
            </CardTitle>
            <CardDescription className="mt-1">
              เปรียบเทียบยอดพร้อมจ่ายกับขั้นต่ำที่กำหนด
            </CardDescription>
          </div>
          {data && <Badge variant="warning">{data.low.length} SKU</Badge>}
        </CardHeader>
        <CardContent className="!px-0 !pb-0">
          {data?.low.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัสสินค้า / ชื่อสินค้า</TableHead>
                  <TableHead className="text-right">พร้อมจ่าย</TableHead>
                  <TableHead className="text-right">ขั้นต่ำ</TableHead>
                  <TableHead>หน่วย</TableHead>
                  <TableHead>
                    <span className="sr-only">รายละเอียด</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.low.slice(0, 8).map((product) => (
                  <TableRow key={product.sku}>
                    <TableCell>
                      <p className="mono text-xs font-semibold">
                        {product.sku}
                      </p>
                      <p className="mt-1 max-w-[200px] truncate text-xs text-muted-foreground sm:max-w-none">
                        {product.name}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-amber-700">
                      {product.ready}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {product.minStock}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {product.unit}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/inventory?keyword=${encodeURIComponent(product.sku)}`}
                        >
                          ดูสินค้า
                          <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              className="min-h-40 py-7"
              title={data ? "ไม่มีสินค้าต่ำกว่าจุดเตือน" : "ยังไม่มีข้อมูลสรุป"}
              description={
                data
                  ? "ยอดพร้อมจ่ายของสินค้าทุกรายการถึงขั้นต่ำที่กำหนดแล้ว"
                  : "โปรดลองโหลดข้อมูลอีกครั้ง"
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
