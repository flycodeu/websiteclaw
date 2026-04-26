import { withTraceId } from "@shop-claw/shared/response";
import { TaskStatus } from "@shop-claw/shared/types";
import { clearTasksByStatus } from "@shop-claw/shared/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { status?: TaskStatus };
    const status = payload.status;

    if (!status) {
      return Response.json(withTraceId(null, "任务状态不能为空"), { status: 400 });
    }

    const result = await clearTasksByStatus(status);
    return Response.json(withTraceId(result, result.clearedCount > 0 ? `已清空 ${result.clearedCount} 个任务` : "没有可清空的任务"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "清空任务失败"),
      { status: 400 }
    );
  }
}
