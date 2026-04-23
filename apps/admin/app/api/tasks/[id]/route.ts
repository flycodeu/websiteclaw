import { withTraceId } from "@shop-claw/shared/response";
import { getTaskById } from "@shop-claw/shared/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  const task = await getTaskById(id);

  if (!task) {
    return Response.json(withTraceId(null, "任务不存在"), { status: 404 });
  }

  return Response.json(withTraceId(task));
}
