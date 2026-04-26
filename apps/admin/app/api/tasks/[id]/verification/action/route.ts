import { withTraceId } from "@shop-claw/shared/response";
import { applyManualVerificationAction, type ManualVerificationActionPayload } from "@/lib/playwright-crawler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const payload = (await request.json()) as ManualVerificationActionPayload;
    const snapshot = await applyManualVerificationAction(id, payload);
    return Response.json(withTraceId(snapshot, "已同步人工验证操作。"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "人工验证操作失败"),
      { status: 400 }
    );
  }
}
