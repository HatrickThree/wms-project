"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FlaskConical,
  Plus,
  UsersRound,
  X,
  Trash2,
  RotateCcw,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  BusyLabel,
  EmptyState,
  Feedback,
  LoadingState,
  PageHeader,
} from "@/components/wms/common";
import { request } from "@/lib/wms";
import { roleLabels, type AppRole } from "@/lib/session-types";
import { ApiError } from "@/lib/wms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { toast } from "sonner";

interface WorkspaceItem {
  id: string;
  code: string;
  name: string;
  type: "BUSINESS" | "TRAINING";
  ownerId: string | null;
  deletion: { deletedAt: string; deletedBy: string } | null;
  _count: { products: number; members: number };
}
interface Member {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
}
interface WorkspaceResult {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string | null;
  role: AppRole;
  userId: string;
}

export function WorkspacesScreen({ role }: { role: AppRole }) {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [name, setName] = useState("");
  const [type, setType] = useState<"BUSINESS" | "TRAINING">(
    role === "ADMIN" ? "BUSINESS" : "TRAINING",
  );
  const [managed, setManaged] = useState<WorkspaceItem | null>(null);
  const [members, setMembers] = useState<{
    members: Member[];
    candidates: Member[];
  } | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [memberRefresh, setMemberRefresh] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [target, setTarget] = useState<WorkspaceItem | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [operationId, setOperationId] = useState("");
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useUnsavedChanges(!!target && (!!confirmation || !!password || uncertain));
  const closeLifecycle = () => {
    setTarget(null);
    setPassword("");
    setConfirmation("");
    setLifecycleError(null);
    setUncertain(false);
    setOperationId("");
  };
  const openLifecycle = (workspace: WorkspaceItem) => {
    setTarget(workspace);
    setPassword("");
    setConfirmation("");
    setLifecycleError(null);
    setUncertain(false);
    setOperationId(crypto.randomUUID());
  };
  const lifecycleAction = async () => {
    if (!target || busy) return;
    setBusy(true);
    setLifecycleError(null);
    try {
      const result = await request<{ message: string }>(
        `/api/workspaces/${target.id}`,
        {
          method: target.deletion ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId,
            confirmName: confirmation,
            ...(target.deletion
              ? { deletedAt: target.deletion.deletedAt }
              : { password }),
          }),
        },
      );
      toast.success(result.message);
      closeLifecycle();
      setRefresh((n) => n + 1);
      router.refresh();
    } catch (e) {
      const unknown = !(e instanceof ApiError) || (e.status || 500) >= 500;
      setUncertain(unknown);
      setLifecycleError(
        unknown
          ? "ยังยืนยันผลไม่ได้ กดตรวจผลรายการเดิมก่อนปิดหน้าต่าง ระบบจะไม่ทำรายการซ้ำ"
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const canCreate = role === "ADMIN" || role === "INSTRUCTOR";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request<WorkspaceResult>(
      `/api/workspaces${showDeleted ? "?deleted=1" : ""}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "โหลดพื้นที่ไม่ได้",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh, showDeleted]);
  useEffect(() => {
    if (!managed) return;
    const controller = new AbortController();
    setMembers(null);
    setMemberError(null);
    setSelectedUser("");
    request<{ members: Member[]; candidates: Member[] }>(
      `/api/workspaces/${managed.id}/members`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setMembers(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setMemberError(
            failure instanceof Error ? failure.message : "โหลดสมาชิกไม่ได้",
          );
      });
    return () => controller.abort();
  }, [managed, memberRefresh]);
  const memberAction = async (
    method: "POST" | "DELETE",
    input: { userId?: string; username?: string },
  ) => {
    if (!managed || busy) return;
    setBusy(true);
    setMemberError(null);
    try {
      await request(`/api/workspaces/${managed.id}/members`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      setMemberRefresh((value) => value + 1);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setMemberError(
        failure instanceof Error ? failure.message : "จัดการสมาชิกไม่ได้",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="ACCOUNT / WORKSPACES"
        title="พื้นที่ธุรกิจและการฝึก"
        description="เลือกพื้นที่ก่อนทำงาน ข้อมูลสินค้าและประวัติแยกจากกัน ผู้เรียนเข้าถึงได้เฉพาะพื้นที่ฝึกที่ได้รับมอบหมาย"
      />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {role === "ADMIN" && (
        <label className="flex min-h-12 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={showDeleted}
            disabled={busy || !!target}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
          แสดงพื้นที่ที่ลบออกจากการใช้งาน (กู้คืนได้)
        </label>
      )}
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>สร้างพื้นที่ใหม่</CardTitle>
            <CardDescription>
              เริ่มจากพื้นที่ว่าง ไม่คัดลอกหรือเปลี่ยนยอดสินค้าในพื้นที่อื่น
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 md:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError(null);
                try {
                  await request("/api/workspaces", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, type }),
                  });
                  setName("");
                  setRefresh((value) => value + 1);
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "สร้างพื้นที่ไม่ได้",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="min-w-0 flex-1">
                <Label htmlFor="workspace-name" className="sr-only">
                  ชื่อพื้นที่
                </Label>
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="ชื่อบริษัท ห้องฝึก หรือกลุ่มเรียน"
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={busy}
                />
              </div>
              <Select
                value={type}
                onValueChange={(value) => setType(value as typeof type)}
                disabled={role !== "ADMIN" || busy}
              >
                <SelectTrigger className="md:w-48" aria-label="ประเภทพื้นที่">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {role === "ADMIN" && (
                    <SelectItem value="BUSINESS">งานธุรกิจ</SelectItem>
                  )}
                  <SelectItem value="TRAINING">พื้นที่ฝึก</SelectItem>
                </SelectContent>
              </Select>
              <Button className="h-12" disabled={busy}>
                {busy ? (
                  <BusyLabel>กำลังสร้าง…</BusyLabel>
                ) : (
                  <>
                    <Plus />
                    สร้างพื้นที่
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {loading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : data?.workspaces.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.workspaces.map((workspace) => (
            <Card key={workspace.id}>
              <CardHeader>
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`flex size-11 items-center justify-center rounded-xl ${workspace.type === "TRAINING" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-primary"}`}
                  >
                    {workspace.type === "TRAINING" ? (
                      <FlaskConical className="size-5" />
                    ) : (
                      <Building2 className="size-5" />
                    )}
                  </span>
                  <Badge
                    variant={
                      workspace.type === "TRAINING" ? "warning" : "default"
                    }
                  >
                    {workspace.type === "TRAINING" ? "พื้นที่ฝึก" : "ธุรกิจ"}
                  </Badge>
                </div>
                <CardTitle>{workspace.name}</CardTitle>
                <CardDescription className="mono break-all text-xs">
                  {workspace.code}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {workspace._count.products} SKU · {workspace._count.members}{" "}
                  สมาชิก
                </p>
                {workspace.deletion && (
                  <p className="text-sm text-destructive">
                    ลบโดย {workspace.deletion.deletedBy} ·{" "}
                    {new Date(workspace.deletion.deletedAt).toLocaleString(
                      "th-TH",
                      { timeZone: "Asia/Bangkok" },
                    )}
                  </p>
                )}
                {workspace.id === data.activeWorkspaceId && (
                  <p className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                    <CheckCircle2 className="size-4" />
                    พื้นที่ปัจจุบัน
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!workspace.deletion && (
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await request("/api/workspaces/switch", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ workspaceId: workspace.id }),
                          });
                          router.push("/");
                          router.refresh();
                        } catch (failure) {
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "เปลี่ยนพื้นที่ไม่ได้",
                          );
                          setBusy(false);
                        }
                      }}
                    >
                      เปิดพื้นที่
                      <ArrowRight />
                    </Button>
                  )}
                  {!workspace.deletion &&
                    (role === "ADMIN" ||
                      (role === "INSTRUCTOR" &&
                        workspace.ownerId === data.userId)) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setManaged(workspace)}
                      >
                        <UsersRound />
                        สมาชิก
                      </Button>
                    )}
                  {role === "ADMIN" && (
                    <Button
                      variant={workspace.deletion ? "outline" : "destructive"}
                      disabled={busy}
                      aria-label={`${workspace.deletion ? "กู้คืน" : "ลบพื้นที่"} ${workspace.name}`}
                      onClick={() => openLifecycle(workspace)}
                    >
                      {workspace.deletion ? <RotateCcw /> : <Trash2 />}
                      {workspace.deletion ? "กู้คืนพื้นที่" : "ลบพื้นที่"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title={
              showDeleted
                ? "ไม่มีพื้นที่ที่ลบไว้"
                : "ยังไม่มีพื้นที่ที่เข้าถึงได้"
            }
            description={
              canCreate
                ? "สร้างพื้นที่ใหม่ หรือให้ผู้ดูแลกำหนดพื้นที่ให้ก่อนเริ่มงาน"
                : "ติดต่อผู้ดูแลหรือผู้สอน เพื่อกำหนดพื้นที่ที่คุณเข้าถึงได้"
            }
          />
        </Card>
      )}
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !busy && !uncertain) closeLifecycle();
        }}
      >
        <DialogContent>
          <DialogTitle>
            {target?.deletion
              ? "กู้คืนพื้นที่"
              : "ยืนยันลบพื้นที่ออกจากการใช้งาน"}
          </DialogTitle>
          <DialogDescription>
            {target?.deletion
              ? "ข้อมูลและสมาชิกเดิมจะกลับมาใช้งานได้ โดยต้องเลือกพื้นที่อีกครั้งหลังการกู้คืน"
              : "พื้นที่นี้จะหายจากรายการและไม่สามารถเข้าทำงานได้ รวมถึงแท็บที่เปิดค้างอยู่ ข้อมูลสินค้า ประวัติ และผลฝึกยังอยู่เพื่อให้ผู้ดูแลกู้คืนได้ ไม่ลบคลังรอบฝึกที่สร้างแยกไว้"}
          </DialogDescription>
          <p className="break-words font-medium">{target?.name}</p>
          {lifecycleError && (
            <Feedback
              value={{
                kind: uncertain ? "uncertain" : "error",
                text: lifecycleError,
              }}
            />
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                confirmation === target?.name &&
                (target.deletion || password)
              )
                void lifecycleAction();
            }}
          >
            <div className="field-group">
              <Label htmlFor="workspace-confirm-name">
                พิมพ์ชื่อพื้นที่ให้ตรงเพื่อยืนยัน
              </Label>
              <Input
                id="workspace-confirm-name"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy || uncertain}
                required
                maxLength={100}
              />
            </div>
            {!target?.deletion && (
              <div className="field-group">
                <Label htmlFor="workspace-confirm-password">
                  รหัสผ่านบัญชีผู้ดูแลของคุณ
                </Label>
                <Input
                  id="workspace-confirm-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy || uncertain}
                  required
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  ตรวจรหัสผ่านอีกครั้งก่อนลบ ไม่บันทึกรหัสผ่านลงประวัติ
                </p>
              </div>
            )}
            <Button
              className="w-full"
              variant={target?.deletion ? "default" : "destructive"}
              disabled={
                busy ||
                confirmation !== target?.name ||
                (!target?.deletion && !password)
              }
            >
              {busy ? (
                <BusyLabel>กำลังตรวจและบันทึก…</BusyLabel>
              ) : uncertain ? (
                "ตรวจผลรายการเดิม"
              ) : target?.deletion ? (
                "ยืนยันกู้คืนพื้นที่"
              ) : (
                "ยืนยันรหัสผ่านและลบพื้นที่"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!managed}
        onOpenChange={(open) => {
          if (!open && !busy) setManaged(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>สมาชิกพื้นที่</SheetTitle>
            <SheetDescription>{managed?.name}</SheetDescription>
          </SheetHeader>
          {memberError && (
            <Feedback value={{ kind: "error", text: memberError }} />
          )}
          {!members && !memberError ? (
            <LoadingState />
          ) : (
            <>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (selectedUser)
                    void memberAction(
                      "POST",
                      role === "ADMIN"
                        ? { userId: selectedUser }
                        : { username: selectedUser },
                    );
                }}
              >
                <Label htmlFor="member-user">
                  {role === "ADMIN"
                    ? "เพิ่มบัญชีที่มีอยู่"
                    : "ชื่อผู้ใช้ของผู้เรียนที่จะเพิ่ม"}
                </Label>
                {role === "ADMIN" ? (
                  <Select
                    value={selectedUser}
                    onValueChange={setSelectedUser}
                    disabled={busy}
                  >
                    <SelectTrigger id="member-user">
                      <SelectValue placeholder="เลือกบัญชีผู้ใช้" />
                    </SelectTrigger>
                    <SelectContent>
                      {members?.candidates
                        .filter(
                          (candidate) =>
                            !members.members.some(
                              (member) => member.id === candidate.id,
                            ),
                        )
                        .map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.displayName} ({candidate.username})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="member-user"
                    value={selectedUser}
                    onChange={(event) => setSelectedUser(event.target.value)}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="รหัสบัญชีผู้เรียนที่ผู้ดูแลสร้างไว้"
                    disabled={busy}
                  />
                )}
                <Button disabled={busy || !selectedUser} className="w-full">
                  <Plus />
                  เพิ่มสมาชิก
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  บทบาทบัญชีต้องตรงกับประเภทพื้นที่
                  การเพิ่มสมาชิกไม่เปลี่ยนบทบาทหรือสร้างบัญชีใหม่
                </p>
              </form>
              <div className="space-y-3 border-t pt-4">
                {members?.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.displayName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {member.username} · {roleLabels[member.role]}
                      </p>
                    </div>
                    {member.id !== managed?.ownerId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={`นำ ${member.username} ออกจากพื้นที่`}
                        onClick={() =>
                          void memberAction("DELETE", { userId: member.id })
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
