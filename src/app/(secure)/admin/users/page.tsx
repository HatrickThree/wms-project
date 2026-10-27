import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { UsersScreen } from "@/components/auth/users";
export const metadata = { title: "บัญชีผู้ใช้" };
export default async function Page() {
  const session = await requirePageSession();
  if (session.user.role !== "ADMIN") redirect("/workspaces");
  return <UsersScreen />;
}
