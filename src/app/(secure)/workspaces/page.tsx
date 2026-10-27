import { requirePageSession } from "@/lib/auth";
import { WorkspacesScreen } from "@/components/auth/workspaces";
export const metadata = { title: "พื้นที่ธุรกิจและการฝึก" };
export default async function Page() {
  const session = await requirePageSession();
  return <WorkspacesScreen role={session.user.role} />;
}
