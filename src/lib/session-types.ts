export const roleLabels = {
  ADMIN: "ผู้ดูแลระบบ",
  STAFF: "เจ้าหน้าที่คลัง",
  INSTRUCTOR: "ผู้สอน",
  STUDENT: "ผู้เรียน",
} as const;
export type AppRole = keyof typeof roleLabels;
export interface SessionProfile {
  user: { id: string; displayName: string; username: string; role: AppRole };
  workspace: {
    id: string;
    name: string;
    type: "BUSINESS" | "TRAINING";
    code: string;
  } | null;
}
