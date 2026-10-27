import { z } from "zod";

export const LabelKindSchema = z.enum(["location", "product", "serial"]);
export type LabelKind = z.infer<typeof LabelKindSchema>;
export const LabelFormatSchema = z.enum(["qr", "code128"]);
export type LabelFormat = z.infer<typeof LabelFormatSchema>;
export const labelKinds: Record<LabelKind, string> = {
  location: "ตำแหน่งจัดเก็บ",
  product: "สินค้า / SKU",
  serial: "Serial Number",
};
export interface LabelItem {
  id: string;
  code: string;
  title: string;
  description: string;
}
export interface LabelCatalog {
  items: LabelItem[];
  total: number;
  page: number;
  pageSize: number;
}
export function labelImageUrl(
  kind: LabelKind,
  id: string,
  format: LabelFormat,
  download = false,
) {
  return `/api/labels/image?${new URLSearchParams({ kind, id, format, ...(download ? { download: "1" } : {}) })}`;
}
