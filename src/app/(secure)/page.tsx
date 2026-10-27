import { Dashboard } from "@/components/wms/dashboard";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ภาพรวมคลัง" };
export default async function Page() {
  const access = await requirePageWorkspace();
  return <Dashboard access={access} />;
}
