import { LoaderCircle } from "lucide-react";

export function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full max-w-[1480px] space-y-6 p-6 sm:p-8"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin text-primary"
        />
        กำลังโหลดพื้นที่ทำงาน…
      </div>
      <div aria-hidden="true" className="space-y-6">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-xl border bg-white"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border bg-white" />
      </div>
    </div>
  );
}
