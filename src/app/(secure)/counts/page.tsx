import { CountsScreen } from "@/components/wms/counts";
import { requirePageWorkspace } from "@/lib/auth";
import { redirect } from "next/navigation";
export const metadata = { title: "ตรวจนับสินค้า" };
export default async function Page() {
  const access = await requirePageWorkspace();
  if (access.user.role === "STUDENT" && access.trainingRound?.status !== "ACTIVE") redirect("/training");
  return <CountsScreen />;
}
