import { tasks } from "@shop-claw/shared/mock-data";
import { withTraceId } from "@shop-claw/shared/response";

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
