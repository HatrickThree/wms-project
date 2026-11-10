"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
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
  deletedAt: string | null;
}
const emptyUser = {
  username: "",
  displayName: "",
  password: "",
  role: "STAFF" as AppRole,
};
export function UsersScreen({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyUser);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<{
    user: UserItem;
    action: "password" | "status" | "delete" | "restore";
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    request<UserItem[]>(
      showDeleted ? "/api/admin/users?deleted=1" : "/api/admin/users",
      {
        signal: controller.signal,
      },
    )
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
  }, [refresh, showDeleted]);
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
            {showDeleted ? "บัญชีที่ลบแล้ว" : "บัญชีในระบบ"}
          </CardTitle>
          <CardDescription>
            {showDeleted
              ? "กู้คืนบัญชีเพื่อให้กลับมาอยู่ในรายการ แล้วเปิดใช้งานอีกครั้งเมื่อต้องการ"
              : "การเปลี่ยนรหัสผ่าน ปิดบัญชี หรือลบบัญชี จะให้บัญชีนั้นออกจากระบบทุกอุปกรณ์"}
          </CardDescription>
          <label className="flex items-center gap-2 pt-2 text-sm">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => {
                setUsers(null);
                setShowDeleted(event.target.checked);
              }}
              disabled={busy}
            />
            แสดงบัญชีที่ลบแล้ว
          </label>
        </CardHeader>
        <CardContent className="!px-0 !pb-0">
          {!users ? (
            <LoadingState />
          ) : !users.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              {showDeleted ? "ยังไม่มีบัญชีที่ลบแล้ว" : "ไม่พบบัญชีในรายการ"}
            </p>
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
                        {user.deletedAt
                          ? "ลบแล้ว"
                          : user.disabled
                            ? "ปิดใช้งาน"
                            : "ใช้งานได้"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.deletedAt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setEditing({ user, action: "restore" });
                              setDialogError(null);
                            }}
                          >
                            กู้คืนบัญชี
                          </Button>
                        ) : (
                          <>
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
                            {user.id !== currentUserId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={busy}
                                aria-label={`ลบบัญชี ${user.username}`}
                                onClick={() => {
                                  setEditing({ user, action: "delete" });
                                  setConfirmUsername("");
                                  setDialogError(null);
                                }}
                              >
                                <Trash2 />
                                ลบบัญชี
                              </Button>
                            )}
                          </>
                        )}
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
            {editing?.action === "delete"
              ? "ลบบัญชีออกจากรายการ"
              : editing?.action === "restore"
                ? "กู้คืนบัญชี"
                : editing?.action === "password"
                  ? "เปลี่ยนรหัสผ่านบัญชี"
                  : editing?.user.disabled
                    ? "เปิดใช้งานบัญชี"
                    : "ปิดใช้งานบัญชี"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {editing?.user.displayName} ({editing?.user.username}) ·{" "}
            {editing?.action === "delete"
              ? "บัญชีจะออกจากระบบทุกอุปกรณ์ ประวัติการทำงานจะยังอยู่ และผู้ดูแลกู้คืนบัญชีได้"
              : editing?.action === "restore"
                ? "บัญชีจะกลับเข้ารายการในสถานะปิดใช้งาน"
                : "ระบบเก็บประวัติการทำงานของบัญชีไว้"}
          </DialogDescription>
          {dialogError && (
            <Feedback value={{ kind: "error", text: dialogError }} />
          )}
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editing || busy) return;
              if (
                editing.action === "delete" &&
                confirmUsername !== editing.user.username
              )
                return;
              setBusy(true);
              setDialogError(null);
              try {
                const result = await request<{ signedOut: boolean }>(
                  `/api/admin/users/${editing.user.id}`,
                  {
                    method: editing.action === "delete" ? "DELETE" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                      editing.action === "delete"
                        ? { confirmUsername }
                        : editing.action === "restore"
                          ? { restore: true }
                          : editing.action === "password"
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
                  toast.success(
                    editing.action === "delete"
                      ? "ลบบัญชีแล้ว"
                      : editing.action === "restore"
                        ? "กู้คืนบัญชีแล้ว บัญชียังปิดใช้งานอยู่"
                        : "บันทึกการเปลี่ยนแปลงแล้ว",
                  );
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
            {editing?.action === "delete" && (
              <div className="field-group">
                <Label htmlFor="confirm-delete-user">
                  พิมพ์ชื่อผู้ใช้เพื่อยืนยัน
                </Label>
                <Input
                  id="confirm-delete-user"
                  value={confirmUsername}
                  onChange={(event) => setConfirmUsername(event.target.value)}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={40}
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
              <Button
                type="submit"
                variant={
                  editing?.action === "delete" ? "destructive" : "default"
                }
                disabled={
                  busy ||
                  (editing?.action === "delete" &&
                    confirmUsername !== editing.user.username)
                }
              >
                {busy ? (
                  <BusyLabel>กำลังบันทึก…</BusyLabel>
                ) : (
                  <>
                    <ShieldCheck />
                    {editing?.action === "delete"
                      ? "ยืนยันลบบัญชี"
                      : editing?.action === "restore"
                        ? "ยืนยันกู้คืน"
                        : "ยืนยัน"}
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
