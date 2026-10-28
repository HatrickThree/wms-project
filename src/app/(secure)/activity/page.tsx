import { ActivityScreen } from "@/components/wms/activity";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "บันทึกการทำงาน" };
export default async function Page() {
  await requirePageWorkspace();
  return <ActivityScreen />;
}
