import { OrdersScreen } from "@/components/wms/orders";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "จ่ายสินค้าออก" };
export default async function Page() {
  const access = await requirePageWorkspace();
  return (
    <OrdersScreen
      canApprove={
        access.workspace.type === "BUSINESS"
          ? access.user.role === "ADMIN"
          : ["ADMIN", "INSTRUCTOR"].includes(access.user.role)
      }
    />
  );
}
