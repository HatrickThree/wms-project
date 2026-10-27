import { HttpError, type WorkspaceAccess } from "@/lib/auth";

export function requireMasterDataAccess(access: WorkspaceAccess) {
  const allowed = access.workspace.type === "BUSINESS" ? ["ADMIN", "STAFF"] : ["ADMIN", "INSTRUCTOR"];
  if (!allowed.includes(access.user.role)) throw new HttpError(403, "ไม่มีสิทธิ์จัดการข้อมูลหลักในพื้นที่นี้");
}
export function requireStockOperator(access: WorkspaceAccess) {
  if (access.user.role === "STUDENT") throw new HttpError(403, "ผู้เรียนต้องทำงานผ่านโจทย์ที่ผู้สอนเปิดให้ก่อน");
}
export function requireStockApproval(access: WorkspaceAccess) {
  if (access.workspace.type === "BUSINESS" ? access.user.role !== "ADMIN" : !["ADMIN", "INSTRUCTOR"].includes(access.user.role))
    throw new HttpError(403, "การอนุมัติข้อยกเว้นต้องเป็นผู้ดูแลในธุรกิจหรือผู้สอนในพื้นที่ฝึก");
}
