export interface CatalogProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string | null;
  baseUom: string;
  minStock: number;
  trackSerial: boolean;
  trackLot: boolean;
  issuePolicy: "FIFO" | "FEFO";
  units?: { id: string; name: string; factor: number }[];
}
export interface CatalogLocation {
  id: string;
  barcode: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  level: string;
  type: string;
  warehouse: { id: string; code: string; name: string };
}
export interface CatalogData {
  products: CatalogProduct[];
  warehouses: { id: string; code: string; name: string }[];
  locations: CatalogLocation[];
  productCount: number;
  locationCount: number;
  limit: number;
}
export interface StockLayerRow {
  id: string;
  productId: string;
  locationId: string;
  referenceDoc: string;
  receivedAt: string;
  qtyOnHand: number;
  qtyAllocated: number;
  product: CatalogProduct;
  location: CatalogLocation;
  lot: { id: string; number: string; expiresOn: string | null } | null;
  serials: { id: string; serialNumber: string; status: string }[];
}
export interface StockData {
  layers: StockLayerRow[];
  count: number;
  limit: number;
  today: string;
  totals: { qtyOnHand: number | null; qtyAllocated: number | null };
}
export interface StockAllocationRow {
  id: string;
  quantity: number;
  pickedAt: string | null;
  pickedBy: string | null;
  overrideBy: string | null;
  overrideReason: string | null;
  stockLayer: StockLayerRow;
  serialItem: { serialNumber: string } | null;
}
export interface StockOrderRow {
  id: string;
  number: string;
  status: "DRAFT" | "RESERVED" | "PICKED" | "SHIPPED" | "CANCELLED";
  createdAt: string;
  createdBy: string;
  lines: {
    id: string;
    productId: string;
    quantity: number;
    requestedQuantity: number;
    requestedUom: string;
    conversionFactor: number;
    product: CatalogProduct;
    allocations: StockAllocationRow[];
  }[];
}
