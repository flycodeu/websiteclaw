import { withTraceId } from "@shop-claw/shared/response";
import { getReviewById } from "@shop-claw/shared/store";
import { saveReviewDraft } from "@shop-claw/shared/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  const review = await getReviewById(id);

  if (!review) {
    return Response.json(withTraceId(null, "审核记录不存在"), { status: 404 });
  }

  return Response.json(withTraceId(review));
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const id = await readParams(context);
    const payload = await request.json();
    const review = await saveReviewDraft(id, payload);
    return Response.json(withTraceId(review, "审核草稿已保存"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "保存审核草稿失败"),
      { status: 400 }
    );
  }
}
