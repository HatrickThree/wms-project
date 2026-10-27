import { SerialsScreen } from "@/components/wms/serials";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ประวัติ Serial" };
export default async function Page() {
  await requirePageWorkspace();
  return <SerialsScreen />;
}
