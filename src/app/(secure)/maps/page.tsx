import { WarehouseMapScreen } from "@/components/wms/warehouse-map";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ผังคลังและเส้นทางหยิบ" };
export default async function Page() {
  const access = await requirePageWorkspace();
  return (
    <WarehouseMapScreen
      canEdit={
        access.workspace.type === "BUSINESS"
          ? ["ADMIN", "STAFF"].includes(access.user.role)
          : ["ADMIN", "INSTRUCTOR"].includes(access.user.role)
      }
      canPlan={access.user.role !== "STUDENT" || access.trainingRound?.status === "ACTIVE"}
    />
  );
}
