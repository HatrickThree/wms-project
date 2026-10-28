import { MasterDataScreen } from "@/components/wms/master-data";
import { requirePageWorkspace } from "@/lib/auth";
import { requireMasterDataAccess } from "@/lib/warehouse-permissions";
import { redirect } from "next/navigation";
export const metadata = { title: "สินค้า คลัง และตำแหน่ง" };
export default async function Page() {
  const access = await requirePageWorkspace();
  try {
    requireMasterDataAccess(access);
  } catch {
    redirect("/workspaces");
  }
  return <MasterDataScreen />;
}
