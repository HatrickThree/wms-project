"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BusyLabel, Feedback, PageHeader } from "@/components/wms/common";
import { request } from "@/lib/wms";
import { roleLabels, type SessionProfile } from "@/lib/session-types";
export function AccountScreen({ profile }: { profile: SessionProfile }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="page-container max-w-3xl">
      <PageHeader
        eyebrow="ACCOUNT / PROFILE"
        title="บัญชีของฉัน"
        description={`${profile.user.displayName} · ${profile.user.username} · ${roleLabels[profile.user.role]}`}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            เปลี่ยนรหัสผ่าน
          </CardTitle>
          <CardDescription>
            หลังเปลี่ยนรหัสผ่าน ระบบจะออกจากบัญชีนี้ทุกอุปกรณ์
            แล้วให้เข้าสู่ระบบใหม่
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4">
              <Feedback value={{ kind: "error", text: error }} />
            </div>
          )}
          <form
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              if (password !== confirmation) {
                setError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await request("/api/auth/password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ currentPassword, password }),
                });
                setCurrentPassword("");
                setPassword("");
                setConfirmation("");
                router.replace("/login");
                router.refresh();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "เปลี่ยนรหัสผ่านไม่ได้",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field-group">
              <Label htmlFor="account-currentPassword">รหัสผ่านปัจจุบัน</Label>
              <Input
                id="account-currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="field-group">
              <Label htmlFor="account-password">
                รหัสผ่านใหม่ อย่างน้อย 10 ตัวอักษร
              </Label>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="field-group">
              <Label htmlFor="account-confirmation">ยืนยันรหัสผ่านใหม่</Label>
              <Input
                id="account-confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <Button disabled={busy} className="h-12">
              {busy ? (
                <BusyLabel>กำลังบันทึก…</BusyLabel>
              ) : (
                "เปลี่ยนรหัสผ่านและเข้าสู่ระบบใหม่"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
