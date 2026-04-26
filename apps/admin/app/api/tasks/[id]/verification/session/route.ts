import { withTraceId } from "@shop-claw/shared/response";
import { getTaskVerificationWorkspace } from "@/lib/task-service";
import { updateEmbeddedVerificationCurrentUrl } from "@/lib/verification-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const workspace = await getTaskVerificationWorkspace(id);
    return Response.json(withTraceId(workspace));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "读取验证工作台状态失败"),
      { status: 400 }
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const payload = (await request.json().catch(() => null)) as { currentUrl?: string } | null;
    const workspace = payload?.currentUrl ? updateEmbeddedVerificationCurrentUrl(id, payload.currentUrl) : null;
    return Response.json(withTraceId(workspace));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "更新验证工作台地址失败"),
      { status: 400 }
    );
  }
}
