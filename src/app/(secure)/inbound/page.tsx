import { ReceivingScreen } from "@/components/wms/receiving";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "รับสินค้าเข้า" };
export default async function Page() {
  await requirePageWorkspace();
  return <ReceivingScreen />;
}
