import { ResearchScreen } from "@/components/wms/research";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "แบบทดสอบและแบบวิจัย" };
export default async function Page() {
  await requirePageWorkspace();
  return <ResearchScreen />;
}
