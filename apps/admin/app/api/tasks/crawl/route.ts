import { withTraceId } from "@shop-claw/shared/response";
import { createAndRunTask } from "@/lib/task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const task = await createAndRunTask(payload);
    return Response.json(withTraceId(task, "任务已执行"), { status: 201 });
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "创建任务失败"),
      { status: 400 }
    );
  }
}
