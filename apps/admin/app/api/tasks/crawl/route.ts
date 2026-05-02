import { withTraceId } from "@shop-claw/shared/response";
import { createAndRunTask } from "@/lib/task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const task = await createAndRunTask(payload);
    const message =
      task.batchId && typeof task.crawlVersion === "number"
        ? `批量抓取已启动，当前版本 V${task.crawlVersion}，首站：${task.sourceName}`
        : typeof task.crawlVersion === "number"
          ? `任务已执行，当前版本 V${task.crawlVersion}`
          : "任务已执行";
    return Response.json(withTraceId(task, message), { status: 201 });
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "创建任务失败"),
      { status: 400 }
    );
  }
}
