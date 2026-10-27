"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BusyLabel,
  Feedback,
  LoadingState,
  PageHeader,
} from "@/components/wms/common";
import { roleLabels, type AppRole } from "@/lib/session-types";
import { CreateUserSchema } from "@/lib/validations/auth.schema";
import { request } from "@/lib/wms";

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  disabled: boolean;
}
const emptyUser = {
  username: "",
  displayName: "",
  password: "",
  role: "STAFF" as AppRole,
};
export function UsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyUser);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<{
    user: UserItem;
    action: "password" | "status";
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    request<UserItem[]>("/api/admin/users", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setUsers(data);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "โหลดบัญชีไม่ได้",
          );
      });
    return () => controller.abort();
  }, [refresh]);
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="ADMIN / USERS"
        title="บัญชีผู้ใช้"
        description="สร้างบัญชีภายในและกำหนดบทบาท จากนั้นมอบหมายพื้นที่ให้บัญชีผ่านหน้าพื้นที่ธุรกิจและการฝึก"
      />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4 text-primary" />
            สร้างบัญชี
          </CardTitle>
          <CardDescription>
            ไม่มีการเปิดสมัครสาธารณะหรือใช้รหัสผ่านเริ่มต้นร่วมกัน
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const parsed = CreateUserSchema.safeParse(form);
              if (!parsed.success) {
                setError(parsed.error.issues[0].message);
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await request("/api/admin/users", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(parsed.data),
                });
                setForm(emptyUser);
                setRefresh((value) => value + 1);
                toast.success(
                  "สร้างบัญชีแล้ว กรุณากำหนดพื้นที่ที่บัญชีนี้เข้าถึงได้",
                );
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "สร้างบัญชีไม่ได้",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field-group">
              <Label htmlFor="user-displayName">ชื่อที่แสดง</Label>
              <Input
                id="user-displayName"
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                disabled={busy}
                required
              />
            </div>
            <div className="field-group">
              <Label htmlFor="user-username">ชื่อผู้ใช้</Label>
              <Input
                id="user-username"
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                required
              />
            </div>
            <div className="field-group">
              <Label htmlFor="user-password">รหัสผ่านเริ่มต้นของบัญชีนี้</Label>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                minLength={10}
                maxLength={128}
                disabled={busy}
                required
              />
            </div>
            <div className="field-group">
              <Label htmlFor="user-role">บทบาท</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm({ ...form, role: value as AppRole })
                }
                disabled={busy}
              >
                <SelectTrigger id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="mt-auto h-12" disabled={busy}>
              {busy ? (
                <BusyLabel>กำลังสร้าง…</BusyLabel>
              ) : (
                <>
                  <UserRound />
                  สร้างบัญชี
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            บัญชีในระบบ
          </CardTitle>
          <CardDescription>
            การเปลี่ยนรหัสผ่านหรือปิดบัญชีจะยกเลิกการเข้าสู่ระบบของบัญชีนั้นทุกอุปกรณ์
          </CardDescription>
        </CardHeader>
        <CardContent className="!px-0 !pb-0">
          {!users ? (
            <LoadingState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ / ชื่อผู้ใช้</TableHead>
                  <TableHead>บทบาท</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium">{user.displayName}</p>
                      <p className="mono mt-1 text-xs text-muted-foreground">
                        {user.username}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role === "ADMIN" ? "default" : "secondary"
                        }
                      >
                        {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.disabled ? "destructive" : "success"}
                      >
                        {user.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditing({ user, action: "password" });
                            setNewPassword("");
                            setDialogError(null);
                          }}
                        >
                          <KeyRound />
                          เปลี่ยนรหัสผ่าน
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditing({ user, action: "status" });
                            setDialogError(null);
                          }}
                        >
                          {user.disabled ? "เปิดบัญชี" : "ปิดบัญชี"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="pr-10 text-lg font-semibold">
            {editing?.action === "password"
              ? "เปลี่ยนรหัสผ่านบัญชี"
              : editing?.user.disabled
                ? "เปิดใช้งานบัญชี"
                : "ปิดใช้งานบัญชี"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {editing?.user.displayName} ({editing?.user.username}) ·
            ไม่ลบประวัติการทำงานของบัญชี
          </DialogDescription>
          {dialogError && (
            <Feedback value={{ kind: "error", text: dialogError }} />
          )}
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editing || busy) return;
              setBusy(true);
              setDialogError(null);
              try {
                const result = await request<{ signedOut: boolean }>(
                  `/api/admin/users/${editing.user.id}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                      editing.action === "password"
                        ? { password: newPassword }
                        : { disabled: !editing.user.disabled },
                    ),
                  },
                );
                setEditing(null);
                setNewPassword("");
                if (result.signedOut) {
                  router.replace("/login");
                  router.refresh();
                } else {
                  setRefresh((value) => value + 1);
                  toast.success("บันทึกการเปลี่ยนแปลงแล้ว");
                }
              } catch (failure) {
                setDialogError(
                  failure instanceof Error
                    ? failure.message
                    : "เปลี่ยนบัญชีไม่ได้",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {editing?.action === "password" && (
              <div className="field-group">
                <Label htmlFor="reset-password">
                  รหัสผ่านใหม่อย่างน้อย 10 ตัวอักษร
                </Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={10}
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <BusyLabel>กำลังบันทึก…</BusyLabel>
                ) : (
                  <>
                    <ShieldCheck />
                    ยืนยัน
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
