import { StockOverviewScreen } from "@/components/wms/stock-overview";
import { requirePageWorkspace } from "@/lib/auth";
export const metadata = { title: "ยอดสต็อกและ Lot" };
export default async function Page() {
  const access = await requirePageWorkspace();
  return <StockOverviewScreen canOperate={access.user.role !== "STUDENT"} />;
}
