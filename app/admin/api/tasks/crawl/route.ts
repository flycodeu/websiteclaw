import { tasks } from "@/lib/mock-data";
import { withTraceId } from "@/lib/response";

export async function POST(request: Request) {
  const payload = await request.json();
  return Response.json(
    withTraceId(
      {
        id: `task_${tasks.length + 201}`,
        sourceId: payload.sourceId ?? "src_unknown",
        status: "PENDING",
        message: "mock crawl task created"
      },
      "task created"
    ),
    { status: 201 }
  );
}
