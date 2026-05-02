import { withTraceId } from "@shop-claw/shared/response";
import { deleteSource, updateSource, updateSourceVisibility } from "@shop-claw/shared/workflow";
import type { UpdateSourcePayload } from "@shop-claw/shared/types";

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
    const payload = (await request.json().catch(() => null)) as UpdateSourcePayload | null;

    if (!payload || typeof payload !== "object") {
      throw new Error("更新参数无效");
    }

    const visibleOnlyKeys = Object.keys(payload);
    const isVisibilityOnly = visibleOnlyKeys.length === 1 && typeof payload.visible === "boolean";

    if (isVisibilityOnly) {
      const source = await updateSourceVisibility(id, payload.visible as boolean);
      return Response.json(withTraceId(source, payload.visible ? "站点已恢复前台展示" : "站点已从前台隐藏"));
    }

    const source = await updateSource(id, payload);
    return Response.json(withTraceId(source, "站点信息已更新"));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "更新站点信息失败"),
      { status: 400 }
    );
  }
}
