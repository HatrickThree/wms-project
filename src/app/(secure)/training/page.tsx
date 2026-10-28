import { TrainingScreen } from "@/components/wms/training";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ห้องเรียนและรอบฝึก" };
export default async function Page() {
  await requirePageWorkspace();
  return <TrainingScreen />;
}
