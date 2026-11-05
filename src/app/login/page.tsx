import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { AuthScreen } from "@/components/auth/auth-screen";
export const dynamic = "force-dynamic";
export const metadata = { title: "เข้าสู่ระบบ" };
export default async function LoginPage() {
  if (!(await prisma.user.findFirst({ select: { id: true } }))) redirect("/setup");
  if (await readSession()) redirect("/");
  return <AuthScreen />;
}
