import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { exportTraining } from "@/services/training.service";
export async function GET(request: Request) {
  return apiHandler(
    async () =>
      new Response(
        await exportTraining(await workspaceAccessForRequest(request)),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=training-results.csv",
            "Cache-Control": "no-store",
          },
        },
      ),
  );
}
