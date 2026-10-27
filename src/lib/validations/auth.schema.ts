import { z } from "zod";
export const UsernameSchema = z
  .string()
  .trim()
  .min(3, "ชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร")
  .max(40)
  .regex(
    /^[a-zA-Z0-9_.-]+$/,
    "ชื่อผู้ใช้ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีด หรือขีดล่าง",
  )
  .transform((value) => value.toLowerCase());
export const PasswordSchema = z
  .string()
  .min(10, "รหัสผ่านอย่างน้อย 10 ตัวอักษร")
  .max(128, "รหัสผ่านไม่เกิน 128 ตัวอักษร");
export const LoginSchema = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(128),
});
export const SetupSchema = z.object({
  username: UsernameSchema,
  displayName: z.string().trim().min(2, "กรุณาระบุชื่อที่แสดง").max(80),
  password: PasswordSchema,
});
export const CreateUserSchema = SetupSchema.extend({
  role: z.enum(["ADMIN", "STAFF", "INSTRUCTOR", "STUDENT"]),
});
export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "กรุณาระบุชื่อพื้นที่").max(100),
  type: z.enum(["BUSINESS", "TRAINING"]),
});
