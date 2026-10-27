import { InventoryScreen } from "@/components/wms/inventory";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "สินค้าคงคลัง" };
export default async function Page() {
  await requirePageWorkspace();
  return <InventoryScreen />;
}
