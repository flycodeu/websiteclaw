import { withTraceId } from "@shop-claw/shared/response";
import { continueTask } from "@/lib/task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  try {
    const payload = await request.json();
    const task = await continueTask(id, payload);
    return Response.json(withTraceId(task, "任务已继续执行"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "继续执行失败"),
      { status: 400 }
    );
  }
}
