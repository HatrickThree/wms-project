import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthScreen } from "@/components/auth/auth-screen";
export const dynamic = "force-dynamic";
export const metadata = { title: "ตั้งค่าผู้ดูแล" };
export default async function SetupPage() {
  if (await prisma.user.findFirst({ select: { id: true } })) redirect("/login");
  return <AuthScreen setup />;
}
