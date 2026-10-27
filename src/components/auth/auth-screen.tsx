"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
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
import { BusyLabel, Feedback } from "@/components/wms/common";
import { LoginSchema, SetupSchema } from "@/lib/validations/auth.schema";
import { request } from "@/lib/wms";

export function AuthScreen({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#101b30] px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3 text-white">
          <span className="flex size-12 items-center justify-center rounded-xl bg-blue-600">
            <Warehouse className="size-7" />
          </span>
          <div>
            <p className="text-2xl font-semibold tracking-tight">
              stockspace<span className="text-blue-400">.</span>
            </p>
            <p className="text-xs text-slate-400">
              คลังสินค้าและพื้นที่ฝึกปฏิบัติ
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {setup ? "ตั้งค่าผู้ดูแลคนแรก" : "เข้าสู่ระบบ"}
            </CardTitle>
            <CardDescription>
              {setup
                ? "สร้างบัญชีของคุณเพื่อดูแลระบบ ข้อมูลสินค้าที่มีอยู่จะยังคงอยู่ในพื้นที่ธุรกิจหลัก"
                : "ใช้บัญชีภายในที่ผู้ดูแลระบบกำหนดให้"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const parsed = (setup ? SetupSchema : LoginSchema).safeParse(
                  form,
                );
                if (!parsed.success) {
                  const next: Record<string, string> = {};
                  parsed.error.issues.forEach((issue) => {
                    next[String(issue.path[0])] ||= issue.message;
                  });
                  setFieldErrors(next);
                  return;
                }
                setBusy(true);
                setError(null);
                setFieldErrors({});
                try {
                  const result = await request<{ next: string }>(
                    `/api/auth/${setup ? "setup" : "login"}`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(parsed.data),
                    },
                  );
                  setForm((previous) => ({ ...previous, password: "" }));
                  router.replace(result.next);
                  router.refresh();
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "ยังเข้าสู่ระบบไม่ได้",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {error && <Feedback value={{ kind: "error", text: error }} />}
              {setup && (
                <div className="field-group">
                  <Label htmlFor="auth-displayName">ชื่อที่แสดง</Label>
                  <Input
                    id="auth-displayName"
                    autoComplete="name"
                    value={form.displayName}
                    onChange={(event) =>
                      setForm({ ...form, displayName: event.target.value })
                    }
                    disabled={busy}
                    aria-invalid={!!fieldErrors.displayName}
                    aria-describedby={
                      fieldErrors.displayName ? "error-displayName" : undefined
                    }
                  />
                  {fieldErrors.displayName && (
                    <p
                      id="error-displayName"
                      className="text-xs text-destructive"
                    >
                      {fieldErrors.displayName}
                    </p>
                  )}
                </div>
              )}
              <div className="field-group">
                <Label htmlFor="auth-username">ชื่อผู้ใช้</Label>
                <Input
                  id="auth-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.username}
                  onChange={(event) =>
                    setForm({ ...form, username: event.target.value })
                  }
                  disabled={busy}
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={
                    fieldErrors.username ? "error-username" : undefined
                  }
                />
                {fieldErrors.username && (
                  <p id="error-username" className="text-xs text-destructive">
                    {fieldErrors.username}
                  </p>
                )}
              </div>
              <div className="field-group">
                <Label htmlFor="auth-password">รหัสผ่าน</Label>
                <div className="relative">
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={setup ? "new-password" : "current-password"}
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                    disabled={busy}
                    className="pr-12"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={
                      fieldErrors.password
                        ? "error-password"
                        : setup
                          ? "password-help"
                          : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-0.5 h-11"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {setup && (
                  <p
                    id="password-help"
                    className="text-xs text-muted-foreground"
                  >
                    อย่างน้อย 10 ตัวอักษร ไม่มีรหัสผ่านเริ่มต้นร่วมกัน
                  </p>
                )}
                {fieldErrors.password && (
                  <p id="error-password" className="text-xs text-destructive">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
              <Button className="h-12 w-full" type="submit" disabled={busy}>
                {busy ? (
                  <BusyLabel>กำลังดำเนินการ…</BusyLabel>
                ) : (
                  <>
                    {setup ? <ShieldCheck /> : <LockKeyhole />}
                    {setup ? "สร้างผู้ดูแลและเริ่มใช้งาน" : "เข้าสู่ระบบ"}
                    <ArrowRight />
                  </>
                )}
              </Button>
            </form>
            <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              {setup
                ? "บัญชีแรกเป็นผู้ดูแลระบบ หลังตั้งค่าแล้วผู้ดูแลสามารถสร้างบัญชีเจ้าหน้าที่ ผู้สอน และผู้เรียน พร้อมกำหนดพื้นที่ที่เข้าถึงได้"
                : "หากยังไม่มีบัญชีหรือลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบของคุณ"}
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-400">
          แยกพื้นที่ธุรกิจและการเรียนรู้ · ไม่เชื่อมบัญชีภายนอก
        </p>
      </div>
    </main>
  );
}
