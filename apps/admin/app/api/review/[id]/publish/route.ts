import { withTraceId } from "@shop-claw/shared/response";
import { publishReview } from "@shop-claw/shared/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  try {
    const result = await publishReview(id);
    return Response.json(withTraceId(result, "已写入公开数据"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "发布失败"),
      { status: 400 }
    );
  }
}
