import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { exportResearch } from "@/services/research.service";
export async function GET(request: Request) {
  return apiHandler(
    async () =>
      new Response(
        await exportResearch(await workspaceAccessForRequest(request)),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              "attachment; filename=research-responses.csv",
            "Cache-Control": "no-store",
          },
        },
      ),
  );
}
