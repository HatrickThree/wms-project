import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
export function Alert({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "destructive" | "success";
}) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "relative flex gap-3 rounded-lg border p-4 text-sm leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0",
        variant === "destructive"
          ? "border-red-200 bg-red-50 text-red-800"
          : variant === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-blue-200 bg-blue-50 text-blue-900",
        className,
      )}
      {...props}
    />
  );
}
export function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("mb-1 font-semibold", className)} {...props} />;
}
export function AlertDescription({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("text-sm leading-relaxed", className)} {...props} />
  );
}
