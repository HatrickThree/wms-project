import { InboundScreen } from "@/components/wms/inbound";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "รับสินค้าเข้า" };
export default async function Page() {
  await requirePageWorkspace();
  return <InboundScreen />;
}
