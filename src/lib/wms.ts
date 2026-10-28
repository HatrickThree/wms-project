export const serialStatuses = {
  IN_STOCK: "อยู่ในคลัง",
  ALLOCATED: "จองแล้ว",
  PICKED: "หยิบแล้ว / รอจ่าย",
  MISSING: "ตรวจนับไม่พบ",
  SHIPPED: "จ่ายออกแล้ว",
  RETURNED: "รับคืน / รอตรวจ",
  DEFECTIVE: "ชำรุด",
} as const;
export const locationTypeLabels: Record<string, string> = {
  RECEIVING: "พักรับเข้า",
  STORAGE: "จัดเก็บ",
  PICKING: "หยิบสินค้า",
  PACKING: "แพ็คสินค้า",
  QUARANTINE: "กักกัน",
};
export const movementLabels: Record<string, string> = {
  INBOUND_RECEIVE: "รับสินค้าเข้า",
  PUTAWAY: "จัดเก็บเข้าชั้นวาง",
  INTERNAL_TRANSFER: "ย้ายชั้นวาง",
  OUTBOUND_PICK: "จ่ายสินค้าออก",
  OUTBOUND_SHIP: "ยืนยันจ่ายสินค้าออก",
  RETURN_IN: "รับสินค้าคืน",
  ADJUSTMENT_PLUS: "ปรับยอดเพิ่ม",
  ADJUSTMENT_MINUS: "ปรับยอดลด",
};
export interface SerialRecord {
  id: string;
  serialNumber: string;
  status: string;
  lotNumber: string | null;
  inboundDocNo: string;
  outboundDocNo: string | null;
  receivedAt: string;
  shippedAt: string | null;
  product: {
    sku: string;
    name: string;
    barcode: string;
    category: string | null;
    baseUom: string;
  };
  location: { barcode: string; zone: string; type: string } | null;
}
export interface SerialDetail extends SerialRecord {
  movements: {
    id: string;
    movementType: string;
    referenceDoc: string;
    qtyChange: number;
    note: string | null;
    createdAt: string;
    performedBy: string;
  }[];
}
export interface InventoryResult {
  serialItems: SerialRecord[];
  groupedSummary: {
    sku: string;
    productName: string;
    category: string;
    locationBarcode: string;
    zone: string;
    inStockCount: number;
    totalMatchedCount: number;
    serialNumbers: {
      serialNumber: string;
      status: string;
      lotNumber: string | null;
      inboundDocNo: string;
      receivedAt: string;
    }[];
  }[];
  filterOptions: {
    categories: string[];
    zones: string[];
    locationBarcodes: string[];
  };
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
export async function resolveScannedProduct(code: string) {
  const product = await request<{ sku: string }>(
    `/api/scan/product?code=${encodeURIComponent(code)}`,
  );
  return product.sku;
}
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const workspaceId =
    typeof document === "undefined"
      ? null
      : document
          .querySelector("[data-workspace-id]")
          ?.getAttribute("data-workspace-id");
  if (workspaceId) headers.set("x-workspace-id", workspaceId);
  const response = await fetch(url, { cache: "no-store", ...init, headers });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new ApiError(
      result.error || "ไม่สามารถทำรายการได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่",
      response.status,
    );
  return result.data as T;
}
export function currentLocation(
  item: Pick<SerialRecord, "location" | "status">,
) {
  return (
    item.location?.barcode ||
    (item.status === "SHIPPED"
      ? "จ่ายออกจากคลังแล้ว"
      : item.status === "MISSING"
        ? "ตรวจนับไม่พบ · ไม่มีตำแหน่งปัจจุบัน"
        : "ไม่ระบุตำแหน่ง")
  );
}
