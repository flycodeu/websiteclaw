import { withTraceId } from "@shop-claw/shared/response";
import { TaskStatus } from "@shop-claw/shared/types";
import { clearTasksByStatus } from "@shop-claw/shared/workflow";
import { closeEmbeddedVerificationSession } from "@/lib/verification-proxy";

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

    await Promise.all(
      result.clearedTaskIds.map(async (taskId) => {
        try {
          const { closeManualVerificationSession } = await import("@/lib/playwright-crawler");
          await closeManualVerificationSession(taskId);
        } catch {
          // Ignore cleanup failures during environments where Playwright is unavailable.
        }
        await closeEmbeddedVerificationSession(taskId);
      })
    );

    const message =
      result.clearedCount === 0
        ? "没有可清空的任务"
        : result.clearedReviewCount > 0
          ? `已清空 ${result.clearedCount} 个任务，并删除 ${result.clearedReviewCount} 条校对数据`
          : `已清空 ${result.clearedCount} 个任务`;

    return Response.json(withTraceId(result, message));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "清空任务失败"),
      { status: 400 }
    );
  }
}
