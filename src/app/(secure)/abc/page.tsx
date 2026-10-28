import { ABCScreen } from "@/components/wms/abc";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ABC และรอบตรวจนับ" };
export default async function Page() {
  const access = await requirePageWorkspace();
  return (
    <ABCScreen
      canApprove={
        access.workspace.type === "BUSINESS"
          ? access.user.role === "ADMIN"
          : ["ADMIN", "INSTRUCTOR"].includes(access.user.role)
      }
    />
  );
}
