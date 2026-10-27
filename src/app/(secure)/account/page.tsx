import { profileForSession } from "@/lib/auth";
import { AccountScreen } from "@/components/auth/account";
export const metadata = { title: "บัญชีของฉัน" };
export default async function Page() {
  return <AccountScreen profile={await profileForSession()} />;
}
