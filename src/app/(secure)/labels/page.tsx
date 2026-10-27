import { LabelsScreen } from "@/components/wms/labels";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ป้าย QR / บาร์โค้ด" };
export default async function Page() {
  await requirePageWorkspace();
  return <LabelsScreen />;
}
