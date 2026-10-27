import { OutboundScreen } from "@/components/wms/outbound";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "จ่ายสินค้าออก" };
export default async function Page() {
  await requirePageWorkspace();
  return <OutboundScreen />;
}
