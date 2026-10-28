import type { ABCClass, ABCTieRule, ABCResult } from "./abc";
export interface ABCConfig {
  windowDays: number;
  thresholdA: number;
  thresholdB: number;
  tieRule: ABCTieRule | null;
  daysA: number | null;
  daysB: number | null;
  daysC: number | null;
}
export interface ABCItem extends ABCResult {
  name: string;
  previousClass: ABCClass | null;
  previousConfirmedAt: string | null;
  profile: {
    class: ABCClass | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
    lastCountedAt: string | null;
  } | null;
  cycleDays: number | null;
  dueDate: string | null;
}
export interface ABCData {
  settings: ABCConfig;
  runs: {
    id: string;
    fromDate: string;
    toDate: string;
    createdAt: string;
    createdBy: string;
  }[];
  run: {
    id: string;
    fromDate: string;
    toDate: string;
    thresholdA: number;
    thresholdB: number;
    tieRule: ABCTieRule;
  } | null;
  items: ABCItem[];
  total: number;
  totalProducts: number;
  page: number;
  pageSize: number;
  today: string;
  history: {
    id: string;
    oldClass: string | null;
    newClass: string;
    reason: string | null;
    confirmedAt: string;
    confirmedBy: string;
    product: { sku: string; name: string };
  }[];
}
