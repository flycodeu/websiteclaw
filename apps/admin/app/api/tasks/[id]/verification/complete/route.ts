import { withTraceId } from "@shop-claw/shared/response";
import { completeTaskVerification } from "@/lib/task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const task = await completeTaskVerification(id);
    const message = task.status === "WAITING_HUMAN" ? "验证尚未完成，请继续在工作台处理。" : "验证完成，任务已继续执行。";
    return Response.json(withTraceId(task, message));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "完成人工验证失败"),
      { status: 400 }
    );
  }
}
