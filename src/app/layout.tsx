import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "stockspace WMS", template: "%s | stockspace WMS" },
  description:
    "ระบบบริหารคลังสินค้าและการฝึกปฏิบัติ แยกข้อมูลธุรกิจกับการเรียนรู้",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
