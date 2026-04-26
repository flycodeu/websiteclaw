import { withTraceId } from "@shop-claw/shared/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  await readParams(context);
  await request.text().catch(() => undefined);

  return Response.json(
    withTraceId(null, "当前验证页已支持直接交互，旧版截图控制接口已停用。"),
    { status: 410 }
  );
}
