import type { CatalogProduct } from "./stock-types";
export interface CountSummary {
  id: string;
  number: string;
  status: string;
  mode: string;
  startedAt: string;
  startedBy: string;
  product: { sku: string; name: string };
}
export interface CountEntryRow {
  id: string;
  locationId: string;
  locationBarcode: string;
  lotNumber: string;
  expiresOn: string | null;
  actualQuantity: number | null;
  enteredQuantity: number | null;
  enteredUom: string | null;
  conversionFactor: number | null;
  serialNumbers: string[];
  countedBy: string | null;
  countedAt: string | null;
  expectedQuantity?: number;
  expectedSerialNumbers?: string[];
  missingSerialNumbers?: string[];
  addedSerialNumbers?: string[];
  variance?: number | null;
}
export interface CountDetails {
  id: string;
  number: string;
  status: string;
  mode: string;
  startedAt: string;
  startedBy: string;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  reason: string | null;
  product: CatalogProduct;
  entries: CountEntryRow[];
  canApprove: boolean;
}
