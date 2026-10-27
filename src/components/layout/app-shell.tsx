"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronRight,
  CircleHelp,
  History,
  LayoutDashboard,
  MapPin,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  Search,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { NavigationGuard, useGuardedNavigation } from "./navigation-guard";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const navigation = [
  { href: "/", label: "ภาพรวมคลัง", icon: LayoutDashboard },
  { href: "/inventory", label: "สินค้าคงคลัง", icon: Boxes },
  { href: "/inbound", label: "รับสินค้าเข้า", icon: ArrowDownToLine },
  { href: "/outbound", label: "จ่ายสินค้าออก", icon: ArrowUpFromLine },
  { href: "/serials", label: "ประวัติ Serial", icon: History },
];
function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useGuardedNavigation();
  const active = navigation.find((item) => item.href === pathname);
  const links = (compact = false) => (
    <nav aria-label="เมนูหลัก" className="space-y-1.5">
      {navigation.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          title={compact ? label : undefined}
          aria-current={pathname === href ? "page" : undefined}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "group flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            pathname === href
              ? "bg-blue-600 font-semibold text-white shadow-sm shadow-blue-900/30"
              : "text-slate-300 hover:bg-slate-800 hover:text-white",
            compact && "justify-center px-0",
          )}
        >
          <Icon className="size-[19px] shrink-0" />
          {!compact && (
            <>
              <span>{label}</span>
              {pathname === href && (
                <ChevronRight className="ml-auto size-4 opacity-70" />
              )}
            </>
          )}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:p-3 focus:text-primary"
      >
        ข้ามไปเนื้อหาหลัก
      </a>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-800 bg-[#101b30] text-white lg:flex",
          collapsed ? "w-20 px-3" : "w-[248px] px-4",
        )}
      >
        <Link
          href="/"
          aria-label="WMS กลับหน้าภาพรวม"
          className={cn(
            "flex h-24 items-center gap-3",
            collapsed ? "justify-center" : "px-2",
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
            <Warehouse className="size-6" />
          </span>
          {!collapsed && (
            <div>
              <span className="text-xl font-bold tracking-tight">
                stockspace<span className="text-blue-400">.</span>
              </span>
              <p className="mt-0.5 text-[10px] tracking-[0.16em] text-slate-400">
                WAREHOUSE MANAGEMENT
              </p>
            </div>
          )}
        </Link>
        {!collapsed && (
          <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.15em] text-slate-400">
            พื้นที่ทำงาน
          </p>
        )}
        {links(collapsed)}
        <div className="mt-auto space-y-4 pb-5 pt-8">
          {!collapsed && (
            <div className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-4">
              <ScanLine className="mb-2 size-5 text-blue-400" />
              <p className="text-xs font-medium text-slate-100">
                พร้อมสำหรับงานสแกน
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                สแกนบาร์โค้ดหรือพิมพ์รหัส แล้วกด Enter ในช่องสแกน
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          {!collapsed && (
            <div className="flex items-center gap-2 border-t border-slate-800 px-2 pt-4 text-xs text-slate-400">
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-800">
                <Package className="size-4" />
              </span>
              <div>
                <p className="text-slate-200">In-House WMS</p>
                <p className="mt-0.5 text-[10px]">
                  จัดการสินค้า · ติดตามทุกชิ้น
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className={cn("min-w-0", collapsed ? "lg:pl-20" : "lg:pl-[248px]")}>
        <header className="sticky top-0 z-30 flex min-h-[72px] items-center gap-3 border-b bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="เปิดเมนู"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Warehouse className="hidden size-4 text-muted-foreground sm:block" />
            <span className="truncate font-medium">ทุกคลังสินค้า</span>
            <ChevronRight className="hidden size-3 text-slate-400 sm:block" />
            <span className="hidden text-muted-foreground sm:block">
              {active?.label || "พื้นที่ทำงาน"}
            </span>
          </div>
          <form
            className="ml-auto hidden w-full max-w-[320px] sm:block"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(
                `/inventory${query.trim() ? `?keyword=${encodeURIComponent(query.trim())}` : ""}`,
              );
            }}
          >
            <label htmlFor="global-search" className="sr-only">
              ค้นหาสินค้าและ Serial
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                id="global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 border-slate-200 bg-slate-50 pl-9"
                placeholder="ค้นหาสินค้า / Serial..."
              />
            </div>
          </form>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="ml-auto sm:hidden"
          >
            <Link href="/inventory" aria-label="ค้นหาสินค้า">
              <Search />
            </Link>
          </Button>
          <div className="hidden h-7 w-px bg-border sm:block" />
          <span
            title="พื้นที่จัดการคลังสินค้า"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-blue-50 text-primary"
          >
            <Warehouse className="size-4" />
          </span>
        </header>
        <main
          id="main-content"
          className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 px-4 pb-6 pt-4 text-[11px] text-muted-foreground sm:px-6 lg:px-8">
          <span>stockspace · ระบบบริหารคลังสินค้า</span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3" />
            เวลาไทย · Asia/Bangkok
          </span>
        </footer>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="max-w-xs border-slate-800 bg-[#101b30] text-white"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Warehouse className="size-6 text-blue-400" />
              stockspace.
            </SheetTitle>
            <SheetDescription className="!text-slate-400">
              ระบบบริหารคลังสินค้า
            </SheetDescription>
          </SheetHeader>
          {links()}
          <p className="mt-auto flex items-center gap-2 text-xs text-slate-400">
            <CircleHelp className="size-4" />
            เลือกงานที่ต้องการจากเมนูด้านบน
          </p>
        </SheetContent>
      </Sheet>
      <Toaster richColors position="bottom-right" closeButton />
    </div>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NavigationGuard>
      <Shell>{children}</Shell>
    </NavigationGuard>
  );
}
