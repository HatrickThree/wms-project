import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { serialStatuses } from "@/lib/wms";
import { cn } from "@/lib/utils";
import { SpeechAnnouncement } from "./speech-guidance";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "IN_STOCK"
      ? "success"
      : status === "ALLOCATED"
        ? "warning"
        : status === "DEFECTIVE" || status === "MISSING"
          ? "destructive"
          : status === "SHIPPED"
            ? "default"
            : "secondary";
  return (
    <Badge variant={variant}>
      <span className="size-1.5 rounded-full bg-current" />
      {serialStatuses[status as keyof typeof serialStatuses] || status}
    </Badge>
  );
}
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border bg-muted/60">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function LoadingState() {
  return (
    <div role="status" className="space-y-4 p-6">
      <span className="sr-only">กำลังโหลดข้อมูล</span>
      <Skeleton className="h-8 w-1/3" />
      {[0, 1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-14 w-full" />
      ))}
    </div>
  );
}
export interface FeedbackValue {
  kind: "success" | "error" | "uncertain";
  text: string;
}
export function Feedback({
  value,
  children,
}: {
  value: FeedbackValue | null;
  children?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <Alert
      variant={
        value.kind === "success"
          ? "success"
          : value.kind === "error"
            ? "destructive"
            : "default"
      }
    >
      {value.kind === "success" ? <CheckCircle2 /> : <AlertCircle />}
      <AlertDescription>
        <SpeechAnnouncement text={value.text} />
        {value.text}
        {children && <div className="mt-3">{children}</div>}
      </AlertDescription>
    </Alert>
  );
}
export function BusyLabel({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LoaderCircle className="size-4 animate-spin" />
      {children}
    </>
  );
}
export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol
      aria-label="ขั้นตอนการทำงาน"
      className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 sm:p-4"
    >
      {steps.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-xs sm:text-sm",
            i > current
              ? "text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs",
              i === current
                ? "bg-primary text-white"
                : i < current
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < current ? <CheckCircle2 className="size-4" /> : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
