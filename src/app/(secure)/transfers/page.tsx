import { TransfersScreen } from "@/components/wms/transfers";
import { requirePageWorkspace } from "@/lib/auth";
import { redirect } from "next/navigation";
export const metadata = { title: "จัดเก็บและย้ายตำแหน่ง" };
export default async function Page() {
  const access = await requirePageWorkspace();
  if (access.user.role === "STUDENT" && access.trainingRound?.status !== "ACTIVE") redirect("/training");
  return <TransfersScreen />;
}
