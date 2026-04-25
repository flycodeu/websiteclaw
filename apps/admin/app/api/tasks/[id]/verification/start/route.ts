import { withTraceId } from "@shop-claw/shared/response";
import { startTaskVerification } from "@/lib/task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const task = await startTaskVerification(id);
    return Response.json(withTraceId(task, "已打开人工验证窗口"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "启动人工验证失败"),
      { status: 400 }
    );
  }
}
