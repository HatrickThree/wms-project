import { Dashboard } from "@/components/wms/dashboard";
import { requirePageWorkspace } from "@/lib/auth";
import { redirect } from "next/navigation";
export const metadata = { title: "ภาพรวมคลัง" };
export default async function Page() {
  const access = await requirePageWorkspace();
  if (access.user.role === "STUDENT") redirect("/training");
  return <Dashboard access={access} />;
}
