import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ภาพรวมคลัง | stockspace WMS",
    template: "%s | stockspace WMS",
  },
  description:
    "ระบบบริหารคลังสินค้า รับเข้า จ่ายออก และติดตาม Serial Number รายชิ้น",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
