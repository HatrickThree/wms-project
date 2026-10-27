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

interface WorkspaceItem {
  id: string;
  code: string;
  name: string;
  type: "BUSINESS" | "TRAINING";
  ownerId: string | null;
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
  const canCreate = role === "ADMIN" || role === "INSTRUCTOR";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request<WorkspaceResult>("/api/workspaces", { signal: controller.signal })
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
  }, [refresh]);
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
                {workspace.id === data.activeWorkspaceId && (
                  <p className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                    <CheckCircle2 className="size-4" />
                    พื้นที่ปัจจุบัน
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
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
                  {(role === "ADMIN" ||
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="ยังไม่มีพื้นที่ที่เข้าถึงได้"
            description={
              canCreate
                ? "สร้างพื้นที่ใหม่ หรือให้ผู้ดูแลกำหนดพื้นที่ให้ก่อนเริ่มงาน"
                : "ติดต่อผู้ดูแลหรือผู้สอน เพื่อกำหนดพื้นที่ที่คุณเข้าถึงได้"
            }
          />
        </Card>
      )}
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
