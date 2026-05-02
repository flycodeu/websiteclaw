import { withTraceId } from "@shop-claw/shared/response";
import { deleteSource, updateSourceVisibility } from "@shop-claw/shared/workflow";

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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => null)) as { visible?: boolean } | null;

    if (typeof payload?.visible !== "boolean") {
      throw new Error("展示状态无效");
    }

    const source = await updateSourceVisibility(id, payload.visible);
    return Response.json(withTraceId(source, payload.visible ? "站点已恢复前台展示" : "站点已从前台隐藏"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "更新站点展示状态失败"),
      { status: 400 }
    );
  }
}
