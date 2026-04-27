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
    const payload = (await _request.json().catch(() => null)) as {
      preferEmbedded?: boolean;
      allowEmbeddedFallback?: boolean;
    } | null;
    const task = await startTaskVerification(id, {
      preferEmbedded: Boolean(payload?.preferEmbedded),
      allowEmbeddedFallback: payload?.allowEmbeddedFallback ?? true
    });
    return Response.json(withTraceId(task, "已启动人工验证工作台"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "启动人工验证失败"),
      { status: 400 }
    );
  }
}
