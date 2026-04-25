import { withTraceId } from "@shop-claw/shared/response";
import { deleteSource } from "@shop-claw/shared/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await deleteSource(id);
    return Response.json(withTraceId(result, "站点及关联数据已删除"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "删除站点失败"),
      { status: 400 }
    );
  }
}
