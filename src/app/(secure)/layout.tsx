import { AppShell } from "@/components/layout/app-shell";
import { profileForSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function SecureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await profileForSession();
  return <AppShell profile={profile}>{children}</AppShell>;
}
